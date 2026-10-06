#!/usr/bin/env python3
import os
import re
import subprocess
import sys
import threading

import gi

gi.require_version("AppIndicator3", "0.1")
gi.require_version("Gdk", "3.0")
gi.require_version("Gtk", "3.0")
from gi.repository import AppIndicator3, Gdk, GLib, Gtk


APP_DIR = os.path.dirname(os.path.abspath(__file__))
START_SCRIPT = os.path.join(APP_DIR, "iniciar-aplicacao-online-fedora.sh")
TMPDIR = os.environ.get("TMPDIR", "/tmp")
URL_FILE = os.path.join(TMPDIR, "geopetro-online.url")
TUNNEL_LOG = os.path.join(TMPDIR, "geopetro-cloudflared.log")
LOG_FILES = [
    os.path.join(TMPDIR, "geopetro-telemetria.log"),
    os.path.join(TMPDIR, "geopetro-telemetria-watch.log"),
    os.path.join(TMPDIR, "geopetro-backend.log"),
    os.path.join(TMPDIR, "geopetro-backend-watch.log"),
    os.path.join(TMPDIR, "geopetro-frontend.log"),
    TUNNEL_LOG,
]


class GeoPetroTray:
    def __init__(self):
        self.url = ""
        self.status_item = Gtk.MenuItem(label="Iniciando GeoPetro IO...")
        self.status_item.set_sensitive(False)

        self.open_item = Gtk.MenuItem(label="Abrir GeoPetro Online")
        self.open_item.connect("activate", self.open_url)

        self.copy_item = Gtk.MenuItem(label="Copiar link de acesso")
        self.copy_item.connect("activate", self.copy_url)

        self.logs_item = Gtk.MenuItem(label="Abrir logs")
        self.logs_item.connect("activate", self.open_logs)

        self.stop_item = Gtk.MenuItem(label="Encerrar aplicacao")
        self.stop_item.connect("activate", self.stop_and_quit)

        self.menu = Gtk.Menu()
        for item in (
            self.status_item,
            Gtk.SeparatorMenuItem(),
            self.open_item,
            self.copy_item,
            self.logs_item,
            Gtk.SeparatorMenuItem(),
            self.stop_item,
        ):
            self.menu.append(item)
        self.menu.show_all()

        self.indicator = AppIndicator3.Indicator.new(
            "geopetro-online",
            "applications-development",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS,
        )
        self.indicator.set_title("GeoPetro IO Online")
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.indicator.set_menu(self.menu)

        self.refresh_menu()
        GLib.timeout_add_seconds(2, self.refresh_menu)

        threading.Thread(target=self.start_application, daemon=True).start()

    def start_application(self):
        try:
            process = subprocess.run(
                [START_SCRIPT, "--background"],
                cwd=APP_DIR,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
            )
        except Exception as exc:
            GLib.idle_add(self.set_status, f"Falha ao iniciar: {exc}")
            return

        output = process.stdout.strip()
        if process.returncode != 0:
            GLib.idle_add(self.set_status, "Falha ao iniciar. Abra os logs.")
            self.notify("GeoPetro IO Online", output[-300:] if output else "Falha ao iniciar.")
            return

        GLib.idle_add(self.refresh_menu)
        self.notify("GeoPetro IO Online", "Aplicacao iniciada na barra superior.")

    def refresh_menu(self):
        self.url = self.read_url()
        if self.url:
            self.set_status(f"Online: {self.url}")
            self.open_item.set_sensitive(True)
            self.copy_item.set_sensitive(True)
        else:
            self.set_status("Iniciando GeoPetro IO...")
            self.open_item.set_sensitive(False)
            self.copy_item.set_sensitive(False)
        return True

    def set_status(self, text):
        self.status_item.set_label(text)

    def read_url(self):
        try:
            with open(URL_FILE, "r", encoding="utf-8") as url_file:
                url = url_file.readline().strip()
                if url:
                    return url
        except FileNotFoundError:
            pass

        try:
            with open(TUNNEL_LOG, "r", encoding="utf-8", errors="ignore") as tunnel_log:
                matches = re.findall(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", tunnel_log.read())
                return matches[-1] if matches else ""
        except FileNotFoundError:
            return ""

    def open_url(self, _item):
        if self.url:
            subprocess.Popen(["xdg-open", self.url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def copy_url(self, _item):
        if not self.url:
            return
        clipboard = Gtk.Clipboard.get_default(Gdk.Display.get_default())
        clipboard.set_text(self.url, -1)
        clipboard.store()
        self.notify("GeoPetro IO Online", "Link copiado.")

    def open_logs(self, _item):
        command = (
            "echo 'Logs do GeoPetro IO'; "
            "echo 'Pressione Ctrl+C para parar de acompanhar os logs.'; "
            "echo; "
            f"tail -n 120 -F {' '.join(LOG_FILES)}; "
            "exec bash -i"
        )

        terminals = [
            ["gnome-terminal", "--title=GeoPetro IO Online - Logs", "--", "bash", "-lc", command],
            ["kgx", "--title", "GeoPetro IO Online - Logs", "--", "bash", "-lc", command],
            ["konsole", "--workdir", APP_DIR, "--title", "GeoPetro IO Online - Logs", "-e", "bash", "-lc", command],
            ["xterm", "-T", "GeoPetro IO Online - Logs", "-e", "bash", "-lc", command],
        ]

        for terminal in terminals:
            if shutil_which(terminal[0]):
                subprocess.Popen(terminal, cwd=APP_DIR)
                return

    def stop_and_quit(self, _item):
        subprocess.run([START_SCRIPT, "--stop"], cwd=APP_DIR, check=False)
        Gtk.main_quit()

    def notify(self, title, message):
        if shutil_which("notify-send"):
            subprocess.Popen(["notify-send", title, message], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def shutil_which(binary):
    for path in os.environ.get("PATH", "").split(os.pathsep):
        candidate = os.path.join(path, binary)
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def main():
    GeoPetroTray()
    Gtk.main()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
