"""Build a dependency-free HTML file that can be opened directly in a browser."""
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'Browser'
html = (root / 'index.html').read_text(encoding="utf-8")
css = (root / 'style.css').read_text(encoding="utf-8")
combat = (root / 'combat.mjs').read_text(encoding="utf-8").replace('export ', '')
game = (root / 'game.mjs').read_text(encoding="utf-8").split('\n', 1)[1]
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('<script type="module" src="game.mjs"></script>', '<script type="module">\n' + combat + '\n' + game + '\n</script>')
html = html.replace('href="./"', 'href="#"')
(root / 'Play-Pitfall.html').write_text(html, encoding="utf-8")
print('Built Browser/Play-Pitfall.html')
