/**
 * Created by phwhitfield on 2/25/14.
 */
const St = imports.gi.St;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Separator = imports.ui.separator;
//const Atk = imports.gi.Atk;
const GLib = imports.gi.GLib;
const Notify = imports.gi.Notify;
const MessageTray = imports.ui.messageTray;


const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const API = Me.imports.redmineAPI;
const Elements = Me.imports.elements;
const convenience = Me.imports.convenience;

function _onVertSepRepaint (area)
{
    let cr = area.get_context();
    let themeNode = area.get_theme_node();
    let [width, height] = area.get_surface_size();
    let stippleColor = themeNode.get_color('-stipple-color');
    let stippleWidth = themeNode.get_length('-stipple-width');
    let x = Math.floor(width/2) + 0.5;
    cr.moveTo(x, 0);
    cr.lineTo(x, height);
    Clutter.cairo_set_source_color(cr, stippleColor);
    cr.setDash([1, 3], 1); // Hard-code for now
    cr.setLineWidth(stippleWidth);
    cr.stroke();
    cr.$dispose();
};

function getTimeSince(beginning){
    let timeNow = new GLib.DateTime();
    let diff = timeNow.difference(beginning);
    let timeVal = new GLib.TimeVal();
    timeVal.add(diff);

    let total_secs = timeVal.tv_sec;
    let secs = total_secs % 60;
    let total_mins = total_secs / 60;
    let mins = total_mins % 60;
    let hours = total_mins / 60;
    return {hours: hours, minutes:mins, seconds: secs};
}

function getTimeString(hms){
    let h = ""+Math.floor(hms['hours']);
    if (h.length < 2)
        h = "0"+h;
    let m = ""+Math.floor(hms['minutes']);
    if (m.length < 2)
        m = "0"+m;
    return h+":"+m;
    /*
    let s = ""+Math.floor(hms['seconds']);
    if (s.length < 2)
        s = "0"+s;
    return h+":"+m+":"+s;
    */
}

//the global TimeTracker object
var timeTracker;

/******************************************************* INDICATOR ***************************************************/
const TimeTrackerIndicator = new Lang.Class({
    Name: 'TimeTrackerIndicator',
    Extends: St.BoxLayout,

    _init: function() {
        this.parent({});

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

        this.spacer = new St.Label({
            text: ' ',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.add_child(this.spacer);

        this.time = new St.Label({
            text: '00:00',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.add_child(this.time);
        this.time.hide();
    }
});


/******************************************************* CONTROLLER ***************************************************/
const TimeTracker = new Lang.Class({
    Name: 'TimeTracker',
    Extends: PanelMenu.Button,

    _init: function(){
        this.settings = convenience.getSettings();

        let menuAlignement = 0;
        if(this.settings.get_boolean('place-center'))
            menuAlignement = 0.5;

        this.parent(menuAlignement, "TimeTracker");

        //create indicator
        this.indicator = new TimeTrackerIndicator();
        this.actor.add_child(this.indicator);

        //create a section for the main box
        let section = new PopupMenu.PopupMenuSection();

        this.mainBox = new St.BoxLayout({ name: 'timeTrackerMainBox', style_class: 'time-tracker-menu-box', vertical:true });
        let topPane = new St.BoxLayout({ style_class: 'time-tracker-menu-top-pane' });
        let middlePane = new St.BoxLayout({ style_class: 'time-tracker-menu-middle-pane' });
        let bottomPane = new St.BoxLayout({ style_class: 'time-tracker-menu-bottom-pane' });
        let rightPane = new St.BoxLayout({ name: 'time-tracker-menu-right-pane', style_class: 'time-tracker-right-box', vertical:true });


        /////////////////////////////////////////////////////////////////////////////////////////////////////build the top pane
        //this.activeIssueLabel = new St.Label({text: 'No issue selected!'});
        this.activeIssueLabel = new PopupMenu.PopupMenuItem("\u25BE No issue selected \u25BE", { style_class: 'time-tracker-active-issue'});
        topPane.add(this.activeIssueLabel.actor, {expand: true, x_align:St.Align.START});

        this.trackingSwitch = new PopupMenu.PopupSwitchMenuItem("", false, {});
        this.trackingSwitch.connect('activate', Lang.bind(this, function(widget) {
            if(widget._switch.state)
                timeTracker.startTracking();
            else
                timeTracker.stopTracking();
        }));
        this.trackingSwitch.label.hide();
        topPane.add(this.trackingSwitch.actor, {expand: false, x_align:St.Align.END});


        ///////////////////////////////////////////////////////////////////////////////////////////////////build the middle pane
        this.projectsMenu = new PopupMenu.PopupMenuSection();
        middlePane.add(this.projectsMenu.actor, {expand: false, x_align:St.Align.START});

        this.projectsArrowMenu = new PopupMenu.PopupMenuSection();
        middlePane.add(this.projectsArrowMenu.actor, {expand: false, x_align:St.Align.START});

        let separator = new St.DrawingArea({ style_class: 'calendar-vertical-separator', pseudo_class: 'highlighted' });
        separator.connect('repaint', Lang.bind(this, _onVertSepRepaint));
        middlePane.add(separator);

        this.activitiesMenu = new PopupMenu.PopupMenuSection();
        rightPane.add(this.activitiesMenu.actor, {expand: false, x_align:St.Align.START});

        let separator = new PopupMenu.PopupSeparatorMenuItem();
        rightPane.add(separator.actor);

        this.issuesMenu = new PopupMenu.PopupMenuSection();
        /*
        this.issuesMenuScroll = new St.ScrollView({ x_fill: true, y_fill: true, y_align: St.Align.START, style_class: 'time-tracker-projects-scroll-container' });
        this.issuesMenuScroll.add_child(this.issuesMenu.actor);
        middlePane.add(this.issuesMenuScroll, {expand: true, x_align:St.Align.START});
        */
        rightPane.add(this.issuesMenu.actor, {expand: true, x_align:St.Align.START});
        middlePane.add(rightPane, {expand: true, x_align:St.Align.START});


        /////////////////////////////////////////////////////////////////////////////////////////////////////build the bottom pane
        let refreshBtn = new Elements.Button('view-refresh-symbolic', null, {style_class: 'time-tracker-refresh-btn'});
        refreshBtn.connect('activate', Lang.bind(this, function() {
            timeTracker.reload();
        }));
        bottomPane.add(refreshBtn.actor);

        let browserBtn = new Elements.Button('network-server-symbolic', null, {style_class: 'time-tracker-browser-btn'});
        browserBtn.connect('activate', Lang.bind(this, function() {
            Gio.app_info_launch_default_for_uri(
                timeTracker.settings.get_string('host'),
                global.create_app_launch_context()
            );
            timeTracker.menu.close();
        }));
        bottomPane.add(browserBtn.actor, {expand: false, x_align:St.Align.START});

        let refreshSpacer = new St.Label({text: ' '});
        bottomPane.add(refreshSpacer, {expand: true});

        let prefBtn = new Elements.Button('preferences-system-symbolic', null, {style_class: 'time-tracker-settings-btn'});
        prefBtn.connect('activate', Lang.bind(this, function() {
            Main.Util.trySpawnCommandLine("gnome-shell-extension-prefs time_tracker@undef.ch");
            timeTracker.menu.close();
        }));
        bottomPane.add(prefBtn.actor, {expand: false, x_align:St.Align.END});


        /////////////////////////////////////////////////////////////////////////////////////////////////////build the menu
        this.mainBox.add_actor(topPane, {expand: false});
        let separator = new Separator.HorizontalSeparator({ style_class: 'popup-separator-menu-item' });
        this.mainBox.add_actor(separator.actor);

        this.mainBox.add_actor(middlePane, {expand: false, x_align:St.Align.START});
        separator = new Separator.HorizontalSeparator({ style_class: 'popup-separator-menu-item' });
        this.mainBox.add_actor(separator.actor);
        this.mainBox.add_actor(bottomPane, {expand: false, x_align:St.Align.START});

        section.actor.add_actor(this.mainBox);
        this.menu.addMenuItem(section);

        this.menu.actor.set_width(560);

        //finally add to the status area
        if(this.settings.get_boolean('place-center'))
            Main.panel.addToStatusArea('timeTracker', this, 1, "center");
        else
            Main.panel.addToStatusArea('timeTracker', this);


        /////////////////////////////////////////////////////////////////////////////////////////////////////load data
        this.isTracking = false;
        this.projects = [];
        this.projectMenuItems = [];
        this.projectArrowItems = [];
        this.projectMenuItemsById = {};
        this.activities = [];
        this.activityMenuItemsById = {};
        this.activityMenuItems = [];
        this.issues = [];
        this.issueMenuItems = [];
        this.issueMenuItemsById = {};
        this.activeIssueMenuItem = null;
        this.activeProjectMenuItem = null;
        this.activeProject = null;
        this.activeIssue = null;
        this.activeIssueMenuItem = null;
        this.activeActivity = null;
        this.activeActivityMenuItem = null;
        this.activeTimeEntry = null;
        this.user = null;
        this.trackingBeginTime = null;
        this.reload();

        //NOTIFICATIIONS
        this.notification = null;
        this.source = new MessageTray.Source("TimeTracker ", 'preferences-system-time-symbolic');
        this.notification = new MessageTray.Notification(this.source);
        Main.messageTray.add(this.source);

        //add the timeout
        GLib.timeout_add_seconds(0, 5, this.onUpdateTimeout, this);
        GLib.timeout_add_seconds(1, this.settings.get_int('save-interval'), this.onSaveTimeout, this);
        GLib.timeout_add_seconds(2, this.settings.get_int('notify-interval'), this.onNotifyTimeout, this);
    },

    reload: function(){
        this.stopTracking();
        //load user data first and then the rest
        API.getCurrentUser(function(user){
            timeTracker.user = user;
            API.getAllProjects(function(projects){timeTracker.setProjectList(projects);});
            API.getAllActivities(function(activities){timeTracker.setActivitiesList(activities);});
        });
    },


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    setProjectList: function(projects){
        for(let i=0; i<this.projectMenuItems.length; i++){
            this.projectMenuItems[i].destroy();
            this.projectArrowItems[i].destroy();
        }

        this.projectMenuItems = [];
        this.projectArrowItems = [];
        this.projectMenuItemsById = {};

        this.projects = projects;

        for(let i=0; i<this.projects.length; i++){
            let project = this.projects[i];
            let menuItem = new Elements.Button(null, project["name"], {style_class: 'time-tracker-project-btn'});

            //add a separate menu arrow item
            let menuArrowItem = new Elements.Button("media-playlist-consecutive-symbolic", " ", {style_class: 'time-tracker-arrow-project-btn', reactive: false});
            menuArrowItem._ornamentLabel.hide();
            menuArrowItem.icon.hide();
            menuArrowItem.actor.set_width(22);
            menuItem.arrow = menuArrowItem;
            menuItem.projectData = project;

            //also highlite the arrow item
            menuItem.connect('active-changed', Lang.bind(this, function(widget) {
                if(widget.actor.has_style_pseudo_class("active"))
                    widget.arrow.actor.add_style_pseudo_class('active');
                else
                    widget.arrow.actor.remove_style_pseudo_class('active');
            }));

            //bind to click event
            menuItem.connect('activate', Lang.bind(this, function(widget) {
                timeTracker.setActiveProject(widget.projectData);
            }));
            this.projectMenuItemsById[project["id"]] = menuItem;
            this.projectsArrowMenu.addMenuItem(menuArrowItem);
            this.projectArrowItems.push(menuArrowItem);
            this.projectMenuItems.push(menuItem);
            this.projectsMenu.addMenuItem(menuItem);
        }
    },

    setActiveProject: function(projectData){
        this.activeProject = projectData;
        this.loadIssues(projectData["id"]);
        if(this.activeProjectMenuItem != null){
            this.activeProjectMenuItem.arrow.icon.hide();
        }
        let widget = this.projectMenuItemsById[projectData["id"]];
        if(!widget)
            return;
        widget.arrow.icon.show();
        timeTracker.activeProjectMenuItem = widget;
    },


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    setActivitiesList: function(activities){
        for(let i=0; i<this.activityMenuItems.length; i++){
            this.activityMenuItems[i].destroy();
        }

        this.activityMenuItems = [];
        this.activityMenuItemsById = {};

        this.activities = activities;
        for(let i=0; i<this.activities.length; i++){
            let activity = this.activities[i];
            let menuItem = new Elements.Button("media-playback-start-symbolic", activity["name"], {style_class: 'time-tracker-activities-btn'});
            menuItem.activityData = activity;
            menuItem.icon.hide();
            this.activitiesMenu.addMenuItem(menuItem);
            this.activityMenuItemsById[activity["id"]] = menuItem;
            this.activityMenuItems.push(menuItem);

            menuItem.connect('activate', Lang.bind(this, function(widget) {
                timeTracker.setActiveActivity(widget.activityData);
            }));

            if(activity["is_default"])
                this.setActiveActivity(activity);
        }
    },

    setActiveActivity: function(activityData){
        if(this.isTracking && this.activeActivity && this.activeActivity["id"] == activityData["id"])
            return;

        this.activeActivity = activityData;
        if(this.activeActivityMenuItem != null){
            this.activeActivityMenuItem.icon.hide();
        }

        this.activeActivityMenuItem = this.activityMenuItemsById[this.activeActivity["id"]];
        this.activeActivityMenuItem.icon.show();

        if(this.activeIssue)
            this.startTracking();
    },


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    loadIssues: function(projectId){
        API.getIssuesFromProject(projectId, function(issues){timeTracker.setIssueList(issues);});
    },

    setIssueList: function(issues){
        for(let i=0; i<this.issueMenuItems.length; i++){
            this.issueMenuItems[i].destroy();
        }
        this.issueMenuItems = [];
        this.issueMenuItemsById = {};

        let hasIssue = false;

        this.issues = issues;
        for(let i=0; i<this.issues.length; i++){
            let issue = this.issues[i];

            //filter subproject issues
            if(issue['project']['id'] == this.activeProject["id"]){
                hasIssue = true;
                let menuItem = new Elements.Button("media-playback-start-symbolic", issue["subject"], {style_class: 'time-tracker-issues-btn'});
                menuItem.issueData = issue;
                menuItem.icon.hide();
                this.issueMenuItems.push(menuItem);
                this.issuesMenu.addMenuItem(menuItem);
                this.issueMenuItemsById[issue["id"]] = menuItem;

                //listen for click events
                menuItem.connect('activate', Lang.bind(this, function(widget) {
                    timeTracker.setActiveIssue(widget.issueData);
                }));
            }
        }

        if(!hasIssue){
            let empty = new PopupMenu.PopupMenuItem("empty", {reactive:false, activate:false});
            this.issueMenuItems.push(empty);
            this.issuesMenu.addMenuItem(empty);
            return;
        }
    },

    setActiveIssue: function(issueData){
        if(this.isTracking && this.activeIssue && this.activeIssue["id"] == issueData["id"])
            return;

        if(this.activeIssueMenuItem != null){
            this.activeIssueMenuItem.icon.hide();
        }

        this.activeIssue = issueData;
        this.activeIssueLabel.label.text = this.activeIssue["subject"];

        this.activeIssueMenuItem = this.issueMenuItemsById[this.activeIssue["id"]]
        this.activeIssueMenuItem.icon.show();

        if(this.activeActivity)
            this.startTracking();
    },

    setActiveTimeEntry: function(timeEntry){
        this.activeTimeEntry = timeEntry;
    },

    notifyActiveIssue: function(title){
        if(!this.activeIssue)
            return;

        if(!this.activeActivity)
            return;

        //if(this.notification)
        //    this.notification.destroy();

        this.notification.update(title, this.activeIssue["subject"]+" ("+this.activeActivity["name"]+")");
        //this.notification.setTransient(true);
        this.source.notify(this.notification);
    },


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    startTracking: function(){
        this.stopTracking();

        if(this.activeIssue == null){
            Elements.showMessage("no issue selected");
            return;
        }

        if(this.activeActivity == null){
            Elements.showMessage("no activity selected");
            return;
        }

        API.createTimeEntry(this.activeIssue["id"], this.activeActivity["id"], function(timeEntry){timeTracker.setActiveTimeEntry(timeEntry);});

        this.isTracking = true;

        //set issue status
        let maxLen = 15;
        let txt = this.activeIssue["subject"];
        if(txt.length >maxLen){
            txt = txt.substr(0, maxLen);
            txt += "...";
        }
        this.indicator.label.text = txt;

        this.indicator.time.text = "00:00";
        this.indicator.time.show();
        this.indicator.icon.icon_name = "media-playback-start-symbolic";

        this.trackingSwitch.setToggleState(true);

        this.trackingBeginTime = new GLib.DateTime();

        this.menu.actor.hide();

        //notify
        this.notifyActiveIssue("started with");
    },

    stopTracking: function(){
        this.trackingSwitch.setToggleState(false);

        if(!this.isTracking)
            return;

        //check if the timeEntry is long enough or kill otherwise
        if(this.activeTimeEntry["hours"] < 0.01)
            API.deleteTimeEntry(this.activeTimeEntry, function(){});
        else
            API.updateTimeEntry(this.activeTimeEntry, function(){});

        //reset gui items
        this.activeTimeEntry = null;

        this.indicator.label.text = "---";

        this.trackingSwitch.setToggleState(false);
        this.indicator.time.text = "00:00";
        this.indicator.time.hide();
        this.indicator.icon.icon_name = "media-playback-pause-symbolic";
        this.isTracking = false;

        this.trackingBeginTime = null;

        //notify
        this.notifyActiveIssue("stopped with");
    },


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    onUpdateTimeout: function(){
        if(!timeTracker.isTracking)
            return true;

        if(!timeTracker.activeTimeEntry)
            return true;

        if(!timeTracker.trackingBeginTime)
            return true;

        let elapsed = getTimeSince(timeTracker.trackingBeginTime);
        timeTracker.activeTimeEntry["hours"] = elapsed["hours"];
        timeTracker.indicator.time.text = getTimeString(elapsed);

        return true;
    },

    onSaveTimeout: function(){
        if(!timeTracker.isTracking)
            return true;

        if(!timeTracker.activeTimeEntry)
            return true;

        if(!timeTracker.trackingBeginTime)
            return true;

        let timePassed =getTimeSince(timeTracker.trackingBeginTime);
        timeTracker.activeTimeEntry["hours"] = timePassed["hours"];

        API.updateTimeEntry(timeTracker.activeTimeEntry, function(){});

        return true;
    },

    onNotifyTimeout: function(){
        if(!timeTracker.isTracking)
            return true;

        timeTracker.notifyActiveIssue("working on");
        
        return true;
    },

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    destroy: function(){
        Notify.uninit();
        Main.panel.statusArea.timeTracker.shutdown();
    }
});


/************************* ENABLE **********************************/
function init(extension) {
}

function enable() {
    timeTracker = new TimeTracker();
}

function disable() {
    timeTracker.destroy();
}
