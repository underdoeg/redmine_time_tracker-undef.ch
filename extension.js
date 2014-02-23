
const Clutter = imports.gi.Clutter;

const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Soup = imports.gi.Soup;
const Pango = imports.gi.Pango;


const Lang = imports.lang;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const convenience = Me.imports.convenience;

const session = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());

//URL used to make API calls
function Url(path,data){
    this._init(path,data);
}

Url.prototype = {
    _init: function(path,data) {
        this._settings = convenience.getSettings();
        this._path = path;
        this._data = data;
    },

    toString: function() {
        let url = this._settings.get_string('host') + this._path + '?key=' + this._settings.get_string('key');
        let params = [];
        for(let param in this._data)
            params.push(param + "=" + this._data[param]);

        if(params.length > 0){
            url = url + '&' + params.join('&');
        }
        return url;
    }

}


// HEADER

const TimeTrackerStatusIcon = new Lang.Class({
    Name: 'TimeTrackerStatusIcon',
    Extends: St.BoxLayout,

    _init: function() {
        this.parent({ style_class: 'panel-status-menu-box' });

        /*
         this.add_child(new St.Icon({
         icon_name: 'edit-paste-symbolic',
         style_class: 'system-status-icon'
         }));
         */

        this.add_child(new St.Label({
            text: 'idle',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        }));
    }
});

const TimeTrackerStateSwitch = new Lang.Class({
    Name: 'OpenErpStateSwitch',
    Extends: PopupMenu.PopupSwitchMenuItem,

    _init: function(client) {
        this.parent(_("track"), false);

        this._fromDaemon = false;

        this.connect('toggled', Lang.bind(this, function() {

        }));
    }
});


function _showHello() {

    let url = new Url('/issues.json',{'assigned_to_id': 'me'});
    let request = Soup.Message.new('GET', url.toString());
    session.queue_message(request, function() {

        let json = request.response_body.data;
        let issues = JSON.parse(json)['issues'];
        textContent = "";
        for (let i = 0; i < issues.length; i ++){
            let issue = issues[i];
            textContent += issue['subject'];
        }

        if (!text) {
            text = new St.Label({ style_class: 'helloworld-label', text: textContent });
            Main.uiGroup.add_actor(text);
        }

        text.opacity = 255;

        let monitor = Main.layoutManager.primaryMonitor;

        text.set_position(Math.floor(monitor.width / 2 - text.width / 2),
            Math.floor(monitor.height / 2 - text.height / 2));

        Tweener.addTween(text,
            { opacity: 0,
                time: 2,
                transition: 'easeOutQuad',
                onComplete: _hideHello });


    });
}

/*****************************************************************************************************************************************/


const TaskMenuItem = new Lang.Class({
    Name: 'TaskMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    _init: function(client, index) {
        this.parent("");

        let text = this.label.clutter_text;
        text.max_length = 60;
        text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_text("subitem");


        this.actor.connect('key-press-event', function(actor, event) {
            let symbol = event.get_key_symbol();
            if (symbol == Clutter.KEY_BackSpace || symbol == Clutter.KEY_Delete) {
                //client.delete(index, null);
                return true;
            }
            return false;
        });

        //this.actor.add(new GPasteDeleteMenuItemPart(client, index), { expand: true, x_align: St.Align.END });
    },

    setText: function(text) {
        this.label.set_text(text);
        this.actor.show();
    }
});


const ProjectMenuItem = new Lang.Class({
    Name: 'ProjectMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function(client, index) {
        this.parent("");

        let text = this.label.clutter_text;
        text.max_length = 60;
        text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_text("PROJECT");

        this.actor.connect('key-press-event', function(actor, event) {
            let symbol = event.get_key_symbol();
            if (symbol == Clutter.KEY_BackSpace || symbol == Clutter.KEY_Delete) {
                //client.delete(index, null);
                return true;
            }
            return false;
        });

        //this.actor.add(new GPasteDeleteMenuItemPart(client, index), { expand: true, x_align: St.Align.END });
    },

    setText: function(text) {
        this.label.set_text(text);
        this.actor.show();
    }
});

/*****************************************************************************************************************************************/

const TimeTrackIndicator = new Lang.Class({
    Name: 'TimeTrackIndicator',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "TimeTracker");

        this.settings = convenience.getSettings();

        this.actor.add_child(new TimeTrackerStatusIcon());

        this.menu.addMenuItem(new TimeTrackerStateSwitch(null));


        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let url = new Url('projects.xml');
        log(url.toString());
        let request = Soup.Message.new('GET',url.toString());
        session.queue_message(request, function() {
            let json = request.response_body.data;
            log(json);
            for(let i=0;i<10;i++){
                this.menu.addMenuItem(new ProjectMenuItem());
            }
        });


    },

    shutdown: function() {
        this._onStateChanged (false);
        this.destroy();
    },

    _onStateChanged: function (state) {
        this._client.on_extension_state_changed(state, null);
    }
});

function init(extension) {
}

function enable() {
    Main.panel.addToStatusArea('timeTracker', new TimeTrackIndicator());
}

function disable() {
    Main.panel.statusArea.timeTracker.shutdown();
}