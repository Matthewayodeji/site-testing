"""Serve the local SOC Web Review workspace on http://127.0.0.1:8000."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial


HOST = "127.0.0.1"
PORT = 8000
WEB_ROOT = Path(__file__).resolve().parent / "web"


class LocalWorkspaceHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'none'; form-action 'self'; "
            "base-uri 'none'; frame-ancestors 'none'",
        )
        super().end_headers()

    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))


def main():
    if not WEB_ROOT.is_dir():
        raise SystemExit("Web assets are missing: %s" % WEB_ROOT)

    handler = partial(LocalWorkspaceHandler, directory=str(WEB_ROOT))
    server = ThreadingHTTPServer((HOST, PORT), handler)
    print("SOC Web Review is running at http://%s:%s" % (HOST, PORT))
    print("This local workspace does not scan or contact review targets.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down SOC Web Review.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
