#!/usr/bin/env python3
"""Génère public/icons.js à partir du paquet @phosphor-icons/core (licence MIT).
Usage : python3 scripts/build-icons.py <dossier package/assets>"""
import re, sys, json, os
assets = sys.argv[1]
# Symbole SF (nom enregistré dans la configuration) -> icône Phosphor « fill »
SF = {
 "newspaper.fill":"newspaper","globe.americas.fill":"globe-hemisphere-west","globe.europe.africa.fill":"globe-hemisphere-east",
 "building.columns.fill":"bank","megaphone.fill":"megaphone","cpu.fill":"cpu","desktopcomputer":"desktop","iphone":"device-mobile",
 "gamecontroller.fill":"game-controller","atom":"atom","flame.fill":"flame","bolt.fill":"lightning","cloud.sun.fill":"cloud-sun",
 "sun.max.fill":"sun","snowflake":"snowflake","umbrella.fill":"umbrella","thermometer.medium":"thermometer","leaf.fill":"leaf",
 "car.fill":"car","tram.fill":"tram","bicycle":"bicycle","airplane":"airplane","figure.walk":"person-simple-walk","map.fill":"map-trifold",
 "sportscourt.fill":"court-basketball","figure.hockey":"hockey","hockey.puck.fill":"record","soccerball":"soccer-ball","football.fill":"football",
 "basketball.fill":"basketball","baseball.fill":"baseball","tennis.racket":"tennis-ball","flag.checkered":"flag-checkered","trophy.fill":"trophy",
 "figure.run":"person-simple-run","dumbbell.fill":"barbell","chart.line.uptrend.xyaxis":"chart-line-up","dollarsign.circle.fill":"currency-circle-dollar",
 "briefcase.fill":"briefcase","cart.fill":"shopping-cart","house.fill":"house","heart.fill":"heart","film.fill":"film-strip","music.note":"music-note",
 "book.fill":"book","fork.knife":"fork-knife","cross.case.fill":"first-aid-kit","graduationcap.fill":"graduation-cap","star.fill":"star",
 "calendar":"calendar-dots","doc.text.fill":"article","bookmark.fill":"bookmark","tag.fill":"tag","bell.fill":"bell","curlybraces":"brackets-curly","antenna.radiowaves.left.and.right":"broadcast",
}
# Icônes d'interface : nom -> (style, icône Phosphor)
UI = {
 "refresh":("bold","arrow-clockwise"),"grid":("bold","squares-four"),"sliders":("bold","sliders-horizontal"),"more":("bold","dots-three"),
 "left":("bold","caret-left"),"right":("bold","caret-right"),"up":("bold","caret-up"),"down":("bold","caret-down"),
 "widen":("bold","arrows-out-line-horizontal"),"narrow":("bold","arrows-in-line-horizontal"),"hide":("bold","eye-slash"),
 "plus":("bold","plus"),"minus":("bold","minus"),"trash":("regular","trash"),"copy":("regular","copy"),
 "check-on":("fill","check-circle"),"check-off":("regular","circle"),"check":("bold","check"),"warning":("fill","warning"),
 "close":("bold","x"),"search":("bold","magnifying-glass"),"pin":("fill","map-pin"),"arrow-up":("bold","arrow-up"),"arrow-down":("bold","arrow-down"),
 "wind":("regular","wind"),"drop":("fill","drop"),"sunset":("fill","sun-horizon"),"thermo":("regular","thermometer-simple"),
 "user":("bold","user"), "users":("regular","users"), "signout":("bold","sign-out"), "key":("regular","key"),
 "reader":("regular","book-open-text"),"gear":("regular","gear"),"gear-bold":("bold","gear"),"drive":("regular","hard-drives"),"link":("bold","link"),"open":("regular","arrow-square-out"),
 "drag":("fill","hand-grabbing"),"offline":("bold","wifi-slash"),"image":("regular","image"),"shield":("fill","shield"),
 "walk":("fill","person-simple-walk"),"car":("fill","car"),"transit":("fill","tram"),"back":("bold","arrow-left"),
 "w-sun":("fill","sun"),"w-moon":("fill","moon-stars"),"w-cloud-sun":("fill","cloud-sun"),"w-cloud-moon":("fill","cloud-moon"),
 "w-cloud":("fill","cloud"),"w-fog":("fill","cloud-fog"),"w-rain":("fill","cloud-rain"),"w-snow":("fill","cloud-snow"),"w-storm":("fill","cloud-lightning"),
 "download":("regular","download-simple"),"upload":("regular","upload-simple"),"reset":("regular","arrow-counter-clockwise"),
}
def inner(style, name):
    f = os.path.join(assets, style, name + ("" if style == "regular" else "-" + style) + ".svg")
    svg = open(f).read()
    return re.sub(r"^<svg[^>]*>|</svg>\s*$", "", svg.strip())
out = {"sf": {k: inner("fill", v) for k, v in SF.items()}, "ui": {k: inner(*v) for k, v in UI.items()}}
dst = os.path.join(os.path.dirname(__file__), "..", "public", "icons.js")
open(dst, "w").write("// Généré par scripts/build-icons.py — icônes Phosphor (MIT, phosphoricons.com)\nexport const ICONS = " + json.dumps(out, ensure_ascii=False) + ";\n")
print("ok", len(out["sf"]), len(out["ui"]), os.path.getsize(dst))
