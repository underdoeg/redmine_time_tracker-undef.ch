
const Clutter = imports.gi.Clutter;

const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Soup = imports.gi.Soup;
const Pango = imports.gi.Pango;
const GLib = imports.gi.GLib;
const Atk = imports.gi.Atk;

const Lang = imports.lang;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const convenience = Me.imports.convenience;

const session = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());

//global time Tracker base object
var timeTracker = null;

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

        this.icon = new St.Icon({
            icon_name: 'media-playback-pause-symbolic',
            style_class: 'system-status-icon'
        });

        this.add_child(this.icon);

        this.label = new St.Label({
            text: '---',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.add_child(this.label);

        this.stopTracking();
    },

    startTracking: function(txt){
        this.setIssueText(txt);
        //this.icon.icon_name = 'document-open-recent-symbolic';
        this.icon.icon_name = 'media-playback-start-symbolic';
    },

    stopTracking: function(){
        this.icon.icon_name = 'media-playback-pause-symbolic';
        this.label.text = "...";
    },

    setIssueText: function(txt){
        let maxLen = 15;
        if(txt.length >maxLen){
            txt = txt.substr(0, maxLen);
            txt += "...";
        }
        this.label.text = txt;
    }
});

const TimeTrackerStateSwitch = new Lang.Class({
    Name: 'TimeTrackerStateSwitch',
    Extends: PopupMenu.Switch,

    _init: function() {
        this.parent(true);

        /*
         this.connect('toggled', Lang.bind(this, function() {

         }));
         */
    }
});

/*****************************************************************************************************************************************/

/* TODO custom current item
 const CurrentIssueItem = new Lang.Class({
 Name: "CurrentIssueItem",
 Extends: PopupMenu.PopupBaseMenuItem,

 _init: function(label, icon) {
 this.parent();

 this._box = new St.Table({style_class: ''});

 this._icon = new St.Icon({style_class: 'current-issue-icon', icon_name: icon + '-symbolic'});
 this._label = new St.Label({text: label, style_class: 'current-issue-label'});
 this._switch = new TimeTrackerStateSwitch();

 //this._box.add(this._icon, {row: 0, col: 0, x_expand: false})
 this._box.add(this._label, {row: 0, col: 1, x_expand: true})
 this._box.add(this._switch.actor, {row: 0, col: 2, x_expand: false})

 this.actor.add(this._box, {span: -1, expand: true});
 },

 setIcon: function(icon) {
 this._icon.icon_name = icon + '-symbolic';
 },

 setLabel: function(text) {
 if (this._label.clutter_text)
 this._label.text = text;
 }
 });
 */

const CurrentIssueItem = new Lang.Class({
    Name: "CurrentIssueItem",
    Extends: PopupMenu.PopupSwitchMenuItem,

    _init: function(label, icon) {
        this.parent("no issue selected", false, { style_class: 'current-issue'});
        this.label.style_class = "current-issue-label";
    }
});

const ActivityMenuItem = new Lang.Class({
    Name: 'IssueMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    _init: function(id, name) {
        this.parent(name);

        this.id = id;
        this.title = name;

    }
});

const IssueMenuItem = new Lang.Class({
    Name: 'IssueMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function(id, name) {
        this.parent("");

        this.id = id;
        this.title = name;

        let text = this.label.clutter_text;
        text.max_length = 60;
        text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_text(this.title);

        //this.connect('activate', Lang.bind(this, this.onClick));

        /*
        this.actor.connect('key-press-event', function(actor, event) {
            let symbol = event.get_key_symbol();
            if (symbol == Clutter.KEY_BackSpace || symbol == Clutter.KEY_Delete) {
                //client.delete(index, null);
                return true;
            }
            return false;
        });
        */

        for(let i=0;i<timeTracker.timeEntries.length;i++){
            let activity = timeTracker.timeEntries[i];
            let activityItem = new ActivityMenuItem(parseInt(activity['id']), activity['name']);
            this.menu.addMenuItem(activityItem);
            //issueItem.connect('activate', Lang.bind(timeTracker, timeTracker._issueClickCallback));
        }

        //this.setSubmenuShown(true);

        //this.actor.add(new GPasteDeleteMenuItemPart(client, index), { expand: true, x_align: St.Align.END });
    },

    onClick: function(widget){
        this.setSubmenuShown(true);
    }
});

const ProjectMenuItem = new Lang.Class({
    Name: 'ProjectMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function(id, name) {
        this.parent("");

        this.id = id;
        this.title = name;

        this.settings = convenience.getSettings();

        let text = this.label.clutter_text;
        text.max_length = 60;
        text.ellipsize = Pango.EllipsizeMode.END;
        this.label.set_text(this.title);

        this.issueItems = [];

        this.reload();
    },

    reload: function(){
        for(let i=0; i<this.issueItems.length; i++){
            this.removeMenuItem(this.issueItems[i]);
        }

        this.issueItems = [];

        let _this = this;

        let data = {};
        data["project_id"] = this.id;
        //check for filter
        if(this.settings.get_boolean("filter-assigned-to-me"))
            data['assigned_to_id'] = 'me';

        let url = new Url('issues.json', data);
        let request = Soup.Message.new('GET',url.toString());
        session.queue_message(request, function() {
            let json = request.response_body.data;
            let issues = JSON.parse(json)['issues'];
            for(let i=0;i<issues.length;i++){
                let issue = issues[i];

                //filter issues from subrpojects
                if(issue['project']['id'] == _this.id){
                    let issueItem = new IssueMenuItem(parseInt(issue['id']), issue['subject']);
                    _this.issueItems.push(issueItem);
                    _this.menu.addMenuItem(issueItem);
                }
            }

            if(_this.issueItems.length == 0){
                let empty = new PopupMenu.PopupMenuItem("Nothin to do! Good boy...", {reactive:false, activate:false});
                _this.issueItems.push(empty);
                _this.menu.addMenuItem(empty);
            }
        });
    }
});

/*****************************************************************************************************************************************/

const TimeTrackMenu = new Lang.Class({
    Name: 'TimeTrackMenu',
    //Extends: PopupMenu.PopupBaseMenuItem,

    _init: function() {
        /*
        let data = { reactive: true,
            activate: true,
            hover: false,
            style_class: null,
            can_focus: true
        };
        this.parent(data);
        */
        this.actor = new St.BoxLayout({ style_class: 'timetracker-menu',
            reactive: true,
            track_hover: false,
            can_focus: true,
            accessible_role: Atk.Role.MENU_ITEM });

        this.actor.set_width(500);
    }
});

const TimeTrackIndicator = new Lang.Class({
    Name: 'TimeTrackIndicator',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "TimeTracker", false);

        this.settings = convenience.getSettings();

        this.statusIcon = new TimeTrackerStatusIcon();

        this.actor.add_child(this.statusIcon);

        this.timeTrackMenu = new TimeTrackMenu();
        this.menu.addMenuItem(this.timeTrackMenu);
        /*
        this.menu.actor.set_width(500);

        this.activeIssueItem = new CurrentIssueItem("No Task Selected", "document-open-recent");

        this.menu.addMenuItem(this.activeIssueItem);

        this.activeIssueItem.actor.hide();

        //this.switch = new TimeTrackerStateSwitch(null);
        //this.menu.addMenuItem(this.switch);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.projectItems = [];
        this.projects = [];

        this.activeIssue = null;
        this.activeTimeEntry = null;
        this.defaultTimeEntry = null;
        this.timeEntries = [];

        this.isTracking = false;

        //add a timeout thingy
        this.saveTimeoutId = GLib.timeout_add_seconds(0, 3, this.onSaveTimeout, this);

        this.reload();

        */
    },

    reload: function(){

        this.stopTracking();

        this.loadTimeEntries();
        this.loadProjects();
    },

    loadTimeEntries: function(){

        this.timeEntries = [];

        this.defaultTimeEntry = null;
        let url = new Url('enumerations/time_entry_activities.json');
        let request = Soup.Message.new('GET',url.toString());
        session.queue_message(request, function() {
            timeTracker.timeEntries = JSON.parse(request.response_body.data)['time_entry_activities'];
        });
    },

    loadProjects: function(){

        for(let i=0; i<this.projectItems.length; i++){
            this.removeMenuItem(this.projectItems[i]);
        }

        this.projectItems = [];

        let url = new Url('projects.json');
        let request = Soup.Message.new('GET',url.toString());
        session.queue_message(request, function() {
            timeTracker.projects = JSON.parse(request.response_body.data)['projects'];
            for(let i=0;i<timeTracker.projects.length;i++){
                let project = timeTracker.projects[i];
                let projectItem = new ProjectMenuItem(parseInt(project['id']), project['name']);
                timeTracker.projectItems.push(projectItem);
                timeTracker.menu.addMenuItem(projectItem);
            }
        });
    },

    _issueClickCallback: function(issueItem){
        this.startTracking(issueItem.id);
    },

    setActiveIssue: function(issue){
        this.activeIssueItem.actor.show();
        this.activeIssue = issue;
        this.activeIssueItem.label.text = this.activeIssue["subject"];
    },

    startTracking: function(issueId){
        this.stopTracking();

        //get the issue from the server
        let url = new Url('issues/'+issueId+'.json');
        let request = Soup.Message.new('GET',url.toString());
        let _this = this;
        //first reload the task data
        session.queue_message(request, function() {
            if(request.response_body.data != ""){

                timeTracker.setActiveIssue(JSON.parse(request.response_body.data)["issue"]);

                //now create a new time entry
                url = new Url('time_entries.json');
                let data = {'time_entry':{'issue_id':issueId}};
                let dataStr = JSON.stringify(data);
                request = Soup.Message.new('POST',url.toString());
                request.set_request("application/json", Soup.MemoryUse.COPY, dataStr, dataStr.length);
                session.queue_message(request, function() {

                    log(request.response_body.data);

                    timeTracker.isTracking = true;

                    timeTracker.activeIssueItem.setToggleState(true);
                    timeTracker.statusIcon.startTracking(timeTracker.activeIssue["subject"]);
                });
            }
        });
    },

    stopTracking: function(){
        if(!this.isTracking)
            return;

        this.isTracking = false;
    },

    shutdown: function() {
        this._onStateChanged (false);
        this.destroy();
    },

    onSaveTimeout: function(data){
        if(!timeTracker.isTracking)
            return true;

        //save the current time


        return true;
    },

    _onStateChanged: function (state) {
        //this._client.on_extension_state_changed(state, null);
    }
});

function init(extension) {
}

function enable() {
    timeTracker = new TimeTrackIndicator();
    Main.panel.addToStatusArea('timeTracker', timeTracker);
}

function disable() {
    Main.panel.statusArea.timeTracker.shutdown();
}