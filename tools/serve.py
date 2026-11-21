# Local server for development. Same as `py -m http.server 8123`, but it tells the browser not to
# keep old copies of the files (Cache-Control: no-store), so every change shows up on a plain reload
# instead of the browser mixing new and old JavaScript modules.
#   py tools/serve.py          -> http://localhost:8123/
#   py tools/serve.py 9000     -> another port
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.webmanifest': 'application/manifest+json',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    print(f'Kaakataaan: http://localhost:{PORT}/  (Ctrl+C to stop)')
    http.server.ThreadingHTTPServer(('', PORT), handler).serve_forever()
