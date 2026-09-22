"""
Entry point CTFd's plugin loader calls: CTFd.plugins.init_plugins() imports this package and
calls load(app) for every directory under CTFd/plugins/ (see that function for exactly how).
"""
from CTFd.plugins import register_admin_plugin_menu_bar, register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES
from CTFd.plugins.migrations import upgrade

from .api import admin_bp, internal_bp, player_bp
from .challenge import MayflyChallenge


def load(app):
    # For SQLite this just calls db.create_all(); for anything else (MySQL in production —
    # see the orchestrator's CLAUDE.md: "CTFd, its MySQL... stay on GCP") it runs the real
    # Alembic revision under migrations/, which is why that file exists rather than relying
    # on db.create_all() alone.
    upgrade(plugin_name="ctfd_mayfly")

    CHALLENGE_CLASSES["mayfly"] = MayflyChallenge
    register_plugin_assets_directory(app, base_path="/plugins/ctfd_mayfly/assets/")

    app.register_blueprint(player_bp)
    app.register_blueprint(internal_bp)
    app.register_blueprint(admin_bp)

    register_admin_plugin_menu_bar(title="Mayfly", route="/plugins/ctfd_mayfly/admin/instances")
