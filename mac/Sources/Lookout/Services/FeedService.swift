import Foundation

enum HTTP {
    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        config.httpAdditionalHeaders = [
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15 Lookout/0.1",
            "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.7",
        ]
        return URLSession(configuration: config)
    }()

    static func url(_ string: String) throws -> URL {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme), url.host != nil else {
            throw BriefingError(trimmed.isEmpty ? "Adresse manquante" : "Adresse invalide")
        }
        return url
    }

    static func data(_ url: URL, headers: [String: String] = [:]) async throws -> Data {
        var request = URLRequest(url: url)
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        do {
            let (data, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw BriefingError("Erreur HTTP \(http.statusCode)")
            }
            return data
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost: throw BriefingError("Aucune connexion Internet")
            case .timedOut: throw BriefingError("Délai d'attente dépassé")
            case .cannotFindHost, .cannotConnectToHost: throw BriefingError("Serveur introuvable")
            default: throw BriefingError(error.localizedDescription)
            }
        }
    }
}

// MARK: - Fils RSS / Atom

enum FeedService {
    struct Result {
        var articles: [Article] = []
        var errors: [UUID: String] = [:]
    }

    /// Télécharge toutes les sources actives en parallèle. Échoue seulement si aucune ne répond.
    static func fetch(_ sources: [FeedSource]) async throws -> Result {
        let active = sources.filter(\.enabled)
        guard !active.isEmpty else { throw BriefingError("Aucune source active") }

        var result = Result()
        await withTaskGroup(of: (FeedSource, Swift.Result<[Article], Error>).self) { group in
            for source in active {
                group.addTask {
                    do { return (source, .success(try await fetch(source))) } catch { return (source, .failure(error)) }
                }
            }
            for await (source, outcome) in group {
                switch outcome {
                case .success(let articles): result.articles += articles
                case .failure(let error): result.errors[source.id] = error.localizedDescription
                }
            }
        }
        if result.articles.isEmpty, let first = result.errors.values.first {
            throw BriefingError(active.count == 1 ? first : "Aucune source n'a répondu (\(first))")
        }
        return result
    }

    static func fetch(_ source: FeedSource) async throws -> [Article] {
        let data = try await HTTP.data(try HTTP.url(source.url))
        let parser = FeedParser()
        let articles = parser.parse(data, source: source)
        if articles.isEmpty { throw BriefingError("Aucun article trouvé (fil RSS invalide ?)") }
        return articles
    }

    /// Filtre, trie et limite les articles selon les réglages d'affichage de la section.
    static func present(_ articles: [Article], options: FeedOptions, sourceOrder: [String], limit: Int) -> [Article] {
        let include = options.includeKeywords.keywordList
        let exclude = options.excludeKeywords.keywordList
        let cutoff = options.maxAgeHours > 0 ? Date().addingTimeInterval(-Double(options.maxAgeHours) * 3600) : nil

        var seen = Set<String>()
        let filtered = articles.filter { article in
            if let cutoff, let date = article.date, date < cutoff { return false }
            let haystack = (article.title + " " + article.summary).lowercased()
            if !include.isEmpty, !include.contains(where: haystack.contains) { return false }
            if exclude.contains(where: haystack.contains) { return false }
            return seen.insert(article.title.lowercased()).inserted
        }
        let sorted = filtered.sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }

        guard options.ordering == .balanced else { return Array(sorted.prefix(limit)) }

        // Alterne entre les sources pour qu'un fil très actif ne monopolise pas la section.
        var queues = Dictionary(grouping: sorted, by: \.source)
        let order = sourceOrder.filter { queues[$0] != nil } + queues.keys.filter { !sourceOrder.contains($0) }.sorted()
        var output: [Article] = []
        while output.count < limit {
            var added = false
            for name in order {
                guard output.count < limit, var queue = queues[name], !queue.isEmpty else { continue }
                output.append(queue.removeFirst())
                queues[name] = queue
                added = true
            }
            if !added { break }
        }
        return output
    }
}

private final class FeedParser: NSObject, XMLParserDelegate {
    private struct Raw {
        var title = "", link = "", summary = "", content = "", date = "", image = "", guid = ""
    }

    private var items: [Raw] = []
    private var current: Raw?
    private var text = ""

    func parse(_ data: Data, source: FeedSource) -> [Article] {
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()

        return items.prefix(60).compactMap { raw in
            let title = HTMLText.plain(raw.title)
            guard !title.isEmpty else { return nil }
            let link = URL(string: raw.link.trimmingCharacters(in: .whitespacesAndNewlines))
            let body = raw.summary.isEmpty ? raw.content : raw.summary
            var image = raw.image
            if image.isEmpty { image = HTMLText.firstImage(in: raw.content + raw.summary) ?? "" }
            let id = raw.guid.isEmpty ? (raw.link.isEmpty ? source.url + title : raw.link) : raw.guid
            return Article(id: source.id.uuidString + id, title: title,
                           summary: String(HTMLText.plain(body).prefix(320)), link: link,
                           date: FeedDate.parse(raw.date),
                           imageURL: URL(string: HTMLText.decodeEntities(image)).flatMap { $0.scheme == nil ? nil : $0 },
                           source: source.name)
        }
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attrs: [String: String] = [:]) {
        let name = elementName.lowercased()
        text = ""
        if name == "item" || name == "entry" {
            current = Raw()
            return
        }
        guard current != nil else { return }
        switch name {
        case "link":
            if let href = attrs["href"] {
                let rel = attrs["rel"] ?? "alternate"
                if rel == "alternate" || current!.link.isEmpty { current!.link = href }
            }
        case "enclosure":
            if current!.image.isEmpty, let url = attrs["url"], (attrs["type"] ?? "image").hasPrefix("image") {
                current!.image = url
            }
        case "media:content", "media:thumbnail":
            let type = attrs["type"] ?? attrs["medium"] ?? "image"
            if current!.image.isEmpty, let url = attrs["url"], type.hasPrefix("image") { current!.image = url }
        default: break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        text += String(data: CDATABlock, encoding: .utf8) ?? ""
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?) {
        guard current != nil else { return }
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        switch elementName.lowercased() {
        case "title": if current!.title.isEmpty { current!.title = value }
        case "link": if current!.link.isEmpty { current!.link = value }
        case "description", "summary": current!.summary = value
        case "content:encoded", "content": current!.content = value
        case "pubdate", "published", "dc:date": current!.date = value
        case "updated": if current!.date.isEmpty { current!.date = value }
        case "guid", "id": current!.guid = value
        case "item", "entry":
            items.append(current!)
            current = nil
        default: break
        }
        text = ""
    }
}

enum FeedDate {
    private static let formats = ["EEE, dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss zzz",
                                  "dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm Z", "yyyy-MM-dd'T'HH:mm:ssZ",
                                  "yyyy-MM-dd'T'HH:mm:ss.SSSZ", "yyyy-MM-dd HH:mm:ss"]

    static func parse(_ string: String) -> Date? {
        let s = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        if let d = iso.date(from: s) { return d }
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: s) { return d }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        for format in formats {
            formatter.dateFormat = format
            if let d = formatter.date(from: s) { return d }
        }
        return nil
    }
}

enum HTMLText {
    private static let named: [String: String] = [
        "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ", "laquo": "«", "raquo": "»",
        "rsquo": "’", "lsquo": "‘", "ldquo": "“", "rdquo": "”", "hellip": "…", "ndash": "–", "mdash": "—",
        "eacute": "é", "egrave": "è", "ecirc": "ê", "euml": "ë", "agrave": "à", "acirc": "â", "ccedil": "ç",
        "ocirc": "ô", "ucirc": "û", "ugrave": "ù", "icirc": "î", "iuml": "ï", "oelig": "œ", "Eacute": "É",
        "Egrave": "È", "Agrave": "À", "Ccedil": "Ç", "euro": "€", "deg": "°", "copy": "©",
    ]
    private static let entity = try! NSRegularExpression(pattern: "&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);")
    private static let tag = try! NSRegularExpression(pattern: "<(script|style)[^>]*>[\\s\\S]*?</\\1>|<[^>]+>")
    private static let space = try! NSRegularExpression(pattern: "\\s+")
    private static let img = try! NSRegularExpression(pattern: "<img[^>]+src=[\"']([^\"']+)[\"']", options: .caseInsensitive)

    static func decodeEntities(_ input: String) -> String {
        guard input.contains("&") else { return input }
        let ns = input as NSString
        var output = input
        for match in entity.matches(in: input, range: NSRange(location: 0, length: ns.length)).reversed() {
            let key = ns.substring(with: match.range(at: 1))
            var replacement: String?
            if key.hasPrefix("#") {
                let hex = key.dropFirst().lowercased().hasPrefix("x")
                let digits = String(key.dropFirst(hex ? 2 : 1))
                if let code = UInt32(digits, radix: hex ? 16 : 10), let scalar = Unicode.Scalar(code) {
                    replacement = String(scalar)
                }
            } else {
                replacement = named[key]
            }
            if let replacement, let range = Range(match.range, in: output) {
                output.replaceSubrange(range, with: replacement)
            }
        }
        return output
    }

    static func plain(_ html: String) -> String {
        var s = html
        // Certains fils encodent le HTML deux fois : on décode avant et après le retrait des balises.
        s = decodeEntities(s)
        s = tag.stringByReplacingMatches(in: s, range: NSRange(location: 0, length: (s as NSString).length), withTemplate: " ")
        s = decodeEntities(s)
        s = space.stringByReplacingMatches(in: s, range: NSRange(location: 0, length: (s as NSString).length), withTemplate: " ")
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func firstImage(in html: String) -> String? {
        let ns = html as NSString
        guard let match = img.firstMatch(in: html, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return ns.substring(with: match.range(at: 1))
    }
}
