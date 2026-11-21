// Génère l'icône « Hublot » de Lookout (macOS requis) : swift scripts/make-icon.swift
//   public/lookout-512.png, public/lookout-180.png (le logo vectoriel est public/logo.svg)
import AppKit

func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: a)
}

/// Dessine l'icône dans un carré de `size` px ; `margin` et `radius` décrivent la plaque de fond.
func render(size: CGFloat, margin: CGFloat, radius: CGFloat) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let plateRect = NSRect(x: margin, y: margin, width: size - 2 * margin, height: size - 2 * margin)
    let plate = NSBezierPath(roundedRect: plateRect, xRadius: radius, yRadius: radius)
    NSGradient(colors: [rgb(0x0B1120), rgb(0x1E293B)], atLocations: [0, 1], colorSpace: .sRGB)!.draw(in: plate, angle: 90)

    // Unité : 1/160 de la plaque (le dessin d'origine tient dans un carré de 160).
    let u = plateRect.width / 160
    let c = NSPoint(x: size / 2, y: size / 2)

    // Hublot : verre sombre cerclé de blanc.
    let glass = NSBezierPath(ovalIn: NSRect(x: c.x - 56 * u, y: c.y - 56 * u, width: 112 * u, height: 112 * u))
    rgb(0x1E293B).setFill()
    glass.fill()
    rgb(0x334155).setFill()
    NSBezierPath(ovalIn: NSRect(x: c.x - 51 * u, y: c.y - 51 * u, width: 102 * u, height: 102 * u)).fill()
    glass.lineWidth = 10 * u
    rgb(0xFFFFFF).setStroke()
    glass.stroke()

    // Les sections, vues à travers le hublot (coordonnées relatives au centre, y vers le bas).
    func tile(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ color: UInt32) {
        rgb(color).setFill()
        NSBezierPath(roundedRect: NSRect(x: c.x + x * u, y: c.y - (y + h) * u, width: w * u, height: h * u),
                     xRadius: 6 * u, yRadius: 6 * u).fill()
    }
    tile(-29, -29, 25, 33, 0x3B82F6)
    tile(1, -29, 28, 21, 0xF59E0B)
    tile(1, -3, 28, 32, 0x10B981)
    tile(-29, 9, 25, 20, 0xEF4444)

    NSGraphicsContext.current = nil
    return rep
}

func write(_ rep: NSBitmapImageRep, _ path: String) {
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

// Carré plein, sans marge ni coins : iOS et Android appliquent leur propre masque.
write(render(size: 512, margin: 0, radius: 0), "public/lookout-512.png")
write(render(size: 180, margin: 0, radius: 0), "public/lookout-180.png")
print("✅ icônes générées")
