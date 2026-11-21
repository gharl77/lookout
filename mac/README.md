# Lookout pour macOS

App native SwiftUI. Voir le [README principal](../README.md) pour la présentation.

- **Réglages** (⌘,) : sections, sources, apparence, actualisation, import/export.
- **Configuration** : `~/Library/Application Support/Lookout/config.json`

## Compiler

Aucun Xcode requis, les Command Line Tools suffisent (macOS 26 ou plus récent) :

    ./build-app.sh     # produit build/Lookout.app
    ./install.sh       # compile, installe dans /Applications et relance
    swift Scripts/make-icon.swift   # régénère les icônes (Mac et web)

L'interface de l'app Mac est en français pour le moment ; la version web est bilingue.
