"""Build a dependency-free HTML file that can be opened directly in a browser."""
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'Browser'
html = (root / 'index.html').read_text()
css = (root / 'style.css').read_text()
combat = (root / 'combat.mjs').read_text().replace('export ', '')
game = (root / 'game.mjs').read_text().split('\n', 1)[1]
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('<script type="module" src="game.mjs"></script>', '<script type="module">\n' + combat + '\n' + game + '\n</script>')
html = html.replace('href="./"', 'href="#"')
(root / 'Play-Pitfall.html').write_text(html)
print('Built Browser/Play-Pitfall.html')
