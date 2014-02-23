const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const OpenErpSettingsWidget = new GObject.Class({
    Name: 'UndefTimeTracker.Prefs.RedmineSettings',
    GTypeName: 'RedmineSettingsWidget',
    Extends: Gtk.VBox,

    _init : function(params) {

        this.parent(params);

        this.margin = 10;

        this._settings = Convenience.getSettings();

        let vbox, label, entry, check;


        vbox = new Gtk.VBox({margin: this.margin});
        this.add(vbox);

        label = new Gtk.Label();
        label.set_markup("Host");
        label.set_alignment(0, 0.5);
        vbox.add(label);

        entry = new Gtk.Entry();
        entry.set_text(this._settings.get_string("host"));
        vbox.add(entry);

        entry.connect('changed', Lang.bind(this, this._hostChanged));


        label = new Gtk.Label({margin_top: 20});
        label.set_markup("API Key");
        label.set_alignment(0, 0.5);
        vbox.add(label);

        entry = new Gtk.Entry();
        entry.set_text(this._settings.get_string("key"));
        vbox.add(entry);

        entry.connect('changed', Lang.bind(this, this._keyChanged));

        //filter mine

        label = new Gtk.Label();
        //label.set_markup("Show only my issues");
        label.set_alignment(0, 0.5);
        vbox.add(label);


        check = new Gtk.CheckButton({label:'Show only issues assigned to me'});
        check.active = this._settings.get_boolean("filter-assigned-to-me")
        vbox.add(check);
        check.connect('toggled', Lang.bind(this, this._myIssuesFilterChanged));

    },

    _hostChanged: function(widget) {
        let txt = widget.get_text();
        if (this._settings.get_string("host") == txt)
            return;

        this._settings.set_string("host", txt)
    },

    _keyChanged: function(widget) {
        let txt = widget.get_text();
        if (this._settings.get_string("key") == txt)
            return;

        this._settings.set_string("key", txt)
    },

    _myIssuesFilterChanged: function(widget) {
        let val = widget.active;
        this._settings.set_boolean("filter-assigned-to-me", val)
    }

});

function init() {

}

function buildPrefsWidget() {
    let widget = new OpenErpSettingsWidget();
    widget.show_all();

    return widget;
}