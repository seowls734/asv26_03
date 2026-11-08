# 한 파일짜리 HTML 만들기: index.html + css + js 모듈을 play.html 하나로 합친다.
# play.html 은 서버 없이 더블클릭(file://)으로도, 어느 웹사이트에 올려도 그대로 실행된다.
# 사용: python tools/build_single.py
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDER = ['data', 'events', 'physics', 'board', 'render', 'ui', 'main']  # 의존 순서

IMPORT_RE = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'\./(\w+)\.js';\s*$", re.M)
DYN_RE = re.compile(r"^const (\w+) = await import\('\./(\w+)\.js'\)\.catch\(.*\);\s*$", re.M)
EXPORT_RE = re.compile(r"^export\s+(const|let|function|class)\s+(\w+)", re.M)


def convert(name, src):
    def imp(m):
        parts = []
        for p in m.group(1).split(','):
            p = p.strip()
            if not p:
                continue
            a = re.split(r'\s+as\s+', p)
            parts.append(f'{a[0]}: {a[1]}' if len(a) == 2 else a[0])
        return f"const {{ {', '.join(parts)} }} = __M.{m.group(2)};"

    src = IMPORT_RE.sub(imp, src)
    src = DYN_RE.sub(lambda m: f"const {m.group(1)} = __M.{m.group(2)} || null;", src)
    names = [m.group(2) for m in EXPORT_RE.finditer(src)]
    src = EXPORT_RE.sub(lambda m: f'{m.group(1)} {m.group(2)}', src)
    if re.search(r'^\s*(import|export)\s', src, re.M):
        raise SystemExit(f'[{name}.js] 변환 못 한 import/export 가 남았습니다')
    return (f"// ── {name}.js ──\n__M.{name} = (function () {{\n{src}\n"
            f"return {{ {', '.join(names)} }};\n}})();\n")


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'css/style.css').read_text(encoding='utf-8')
    js = "'use strict';\nvar __M = {};\n" + ''.join(
        convert(n, (ROOT / f'js/{n}.js').read_text(encoding='utf-8')) for n in ORDER)
    js = js.replace('</script', '<\\/script')

    html = html.replace('<link rel="stylesheet" href="css/style.css">', f'<style>\n{css}\n</style>')
    # file:// 안내 스크립트 제거 (한 파일 버전은 file:// 에서도 돌아감)
    html = re.sub(r'<script>\s*// 파일을 더블클릭[\s\S]*?</script>\n', '', html)
    html = html.replace('<script type="module" src="js/main.js"></script>',
                        f'<script>\n(function () {{\n{js}\n}})();\n</script>')
    if 'src="js/' in html or 'href="css/' in html:
        raise SystemExit('index.html 의 css/js 연결 부분을 찾지 못했습니다')
    out = ROOT / 'play.html'
    out.write_text(html, encoding='utf-8')
    print(f'만들었습니다: {out} ({out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
