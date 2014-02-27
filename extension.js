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

const Ornament = {
    NONE: 0,
    DOT: 1,
    CHECK: 2
};

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

/********************************************************* BUTTONS ****************************************************/

const BaseButton = new Lang.Class({
    Name: 'BaseButton',
    Extends: PopupMenu.PopupMenuItem,

    _init: function(title, data){
        this.parent(title, data);
    }
});

const ProjectButton = new Lang.Class({
    Name: 'ProjectButton',
    Extends: BaseButton,

    _init: function(data){
        this.data = data;
        let style_class = 'time-tracker-project-btn';
        if(data["parent"])
            style_class = 'time-tracker-subproject-btn';
        this.parent(data["name"], {style_class: style_class});
    }
});

const ProjectParentButton = new Lang.Class({
    Name: 'ProjectParentButton',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function(data){
        this.data = data;
        this.parent(data["name"], false);
        this.label.style_class = 'time-tracker-project-btn';
    }
});

const ActivityButton = new Lang.Class({
    Name: 'ProjectButton',
    Extends: BaseButton,

    _init: function(data){
        this.data = data;
        this.parent(data["name"], {style_class: 'time-tracker-activity-btn'});
    }
});

const IssueButton = new Lang.Class({
    Name: 'ProjectButton',
    Extends: BaseButton,

    _init: function(data){
        this.data = data;
        this.parent(data["subject"], {style_class: 'time-tracker-issue-btn'});
    }
});

const EntryMenuItem = new Lang.Class({
    Name: 'EntryMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(){
        this.parent({reactive: false});
        this.entry = new St.Entry({name: 'searchEntry',
            can_focus: true,
            track_hover: false,
            hint_text: _("What are you doing?"),
            style_class: 'time-tracker-activity-entry',
            x_expand: true
        });

        this.actor.add(this.entry);
        //this.data = data;
    },

    show: function(){
        this.actor.show();
    },

    hide: function(){
        this.actor.hide();
    }
});

//this is an EXTREMLY ugly hack to avoid errors when using a PopupSubMenuMenuItem without a proper parent
//TODO: find a clean solution for this
const FakeMenu = new Lang.Class({
    Name: 'FakeMenu',

    _init: function(actor){
        this.actor = actor;
    },

    _getTopMenu: function(){
        return this;
    },

    _setOpenedSubMenu: function(){

    },

    close: function(){}
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
        //let rightPane = new St.BoxLayout({ name: 'time-tracker-menu-right-pane', style_class: 'time-tracker-right-box', vertical:true });

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

        this.mainBox.add_actor(topPane, {expand: false});

        ///////////////////////////////////////////////////////////////////////////////////////////////////activity description
        this.activityDescription = new EntryMenuItem();
        this.activityDescription.hide();
        this.mainBox.add(this.activityDescription.actor, {expand: true});

        let separator = new Separator.HorizontalSeparator({ style_class: 'popup-separator-menu-item' });
        this.mainBox.add_actor(separator.actor);

        ///////////////////////////////////////////////////////////////////////////////////////////////////build the middle pane
        this.projectsMenu = new PopupMenu.PopupMenuSection();
        let fakeMenu = new FakeMenu(this.projectsMenu.actor);
        //hack to avoid error on open submenu
        this.projectsMenu._setParent(fakeMenu);
        middlePane.add(this.projectsMenu.actor, {expand: false, x_align:St.Align.START});

        let separator = new St.DrawingArea({ style_class: 'calendar-vertical-separator', pseudo_class: 'highlighted' });
        separator.connect('repaint', Lang.bind(this, _onVertSepRepaint));
        middlePane.add(separator);

        let activitiesAndIssuesMenu = new PopupMenu.PopupMenuSection();
        fakeMenu = new FakeMenu(activitiesAndIssuesMenu.actor);
        //hack to avoid error on open submenu
        activitiesAndIssuesMenu._setParent(fakeMenu);
        this.activitiesMenu = new PopupMenu.PopupSubMenuMenuItem("Activities", false);
        activitiesAndIssuesMenu.addMenuItem(this.activitiesMenu);
        //rightPane.add(this.activitiesMenuParent.actor, {expand: false, x_align:St.Align.START});

        let separator = new PopupMenu.PopupSeparatorMenuItem();
        activitiesAndIssuesMenu.addMenuItem(separator);
        //rightPane.add(separator.actor);

        this.issuesMenu = new PopupMenu.PopupMenuSection();
        activitiesAndIssuesMenu.addMenuItem(this.issuesMenu);
        /*
         this.issuesMenuScroll = new St.ScrollView({ x_fill: true, y_fill: true, y_align: St.Align.START, style_class: 'time-tracker-projects-scroll-container' });
         this.issuesMenuScroll.add_child(this.issuesMenu.actor);
         middlePane.add(this.issuesMenuScroll, {expand: true, x_align:St.Align.START});
         */
        //rightPane.add(this.issuesMenu.actor, {expand: true, x_align:St.Align.START});
        middlePane.add(activitiesAndIssuesMenu.actor, {expand: true, x_align:St.Align.START});


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

        let prefSpacer = new St.Label({text: ' '});
        bottomPane.add(prefSpacer, {expand: true});

        let prefBtn = new Elements.Button('preferences-system-symbolic', null, {style_class: 'time-tracker-settings-btn'});
        prefBtn.connect('activate', Lang.bind(this, function() {
            Main.Util.trySpawnCommandLine("gnome-shell-extension-prefs time_tracker@undef.ch");
            timeTracker.menu.close();
        }));
        bottomPane.add(prefBtn.actor, {expand: false, x_align:St.Align.END});


        /////////////////////////////////////////////////////////////////////////////////////////////////////build the menu

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
        this.projectMenuItemsById = {};
        this.openProjectParent = null;
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

    updateActiveIssueLabel: function(){
        let txt = "";
        if(this.activeProject)
            txt += this.activeProject["name"]+": ";
        if(this.activeIssue)
            txt += this.activeIssue["subject"];
        else
            txt += "...";
        if(this.activeIssue && this.activeActivity)
            txt += " ("+this.activeActivity["name"]+")";
        this.activeIssueLabel.label.text = txt;
    },

    reload: function(){
        this.activeActivity = null;
        this.activeProject = null;
        this.activeIssue = null;
        if(this.activeIssueMenuItem)
            this.activeIssueMenuItem.setOrnament(Ornament.NONE);
        if(this.activeProjectMenuItem)
            this.activeProjectMenuItem.setOrnament(Ornament.NONE);
        if(this.activeActivityMenuItem)
            this.activeActivityMenuItem.setOrnament(Ornament.NONE);
        if(this.openProjectParent)
            this.openProjectParent.setSubmenuShown(false);

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
        }

        this.projectMenuItems = [];
        this.projectMenuItemsById = {};

        this.projects = projects;

        //store additional information about child/parent relations in data
        for(let i=0; i<this.projects.length; i++){
            let project = this.projects[i];
            if(project["parent"]){
                let parentId = project["parent"]["id"];
                for(let j=0; j<this.projects.length; j++){
                    if(this.projects[j]["id"] == parentId){
                        this.projects[j]["hasChild"] = true;
                    }
                }
            }
        }

        //create projects
        let childProjects = [];
        for(let i=0; i<this.projects.length; i++){
            let project = this.projects[i];

            //add child projects later
            if(!project["parent"]){

                let menuItem = null;
                if(project["hasChild"]){
                    menuItem = new ProjectParentButton(project);
                    menuItem.menu.connect('open-state-changed', Lang.bind(this, function(widget) {
                        if(timeTracker.openProjectParent)
                            timeTracker.openProjectParent.setSubmenuShown(false);
                        timeTracker.openProjectParent = menuItem;
                        timeTracker.setActiveProject(project);
                    }));
                }else{
                    menuItem = new ProjectButton(project);
                    menuItem.connect('activate', Lang.bind(this, function(widget) {
                        timeTracker.setActiveProject(project);
                    }));
                }
                this.projectMenuItemsById[project["id"]] = menuItem;
                this.projectMenuItems.push(menuItem);
                this.projectsMenu.addMenuItem(menuItem);
            }else{
                childProjects.push(project);
            }
        }

        //now build the submenu projects
        for(let i=0; i<childProjects.length; i++){
            let project = childProjects[i];
            let menuItem = new ProjectButton(project);
            menuItem.connect('activate', Lang.bind(this, function(widget) {
                timeTracker.setActiveProject(project);
            }));
            this.projectMenuItems.push(menuItem);
            this.projectMenuItemsById[project["id"]] = menuItem;
            this.projectMenuItemsById[project["parent"]["id"]].menu.addMenuItem(menuItem);
        }
    },

    setActiveProject: function(projectData){
        if(this.activeProject && this.activeProject["id"] == projectData["id"])
            return;

        this.setActiveIssue(null);

        this.activeProject = projectData;
        this.loadIssues(projectData["id"]);
        if(this.activeProjectMenuItem != null){
            this.activeProjectMenuItem.setOrnament(false);
        }
        let widget = this.projectMenuItemsById[projectData["id"]];
        if(!widget)
            return;
        widget.setOrnament(Ornament.DOT);
        timeTracker.activeProjectMenuItem = widget;
        this.updateActiveIssueLabel();
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
            let menuItem = new ActivityButton(activity);
            this.activitiesMenu.menu.addMenuItem(menuItem);
            this.activityMenuItemsById[activity["id"]] = menuItem;
            this.activityMenuItems.push(menuItem);

            menuItem.connect('activate', Lang.bind(this, function(widget) {
                timeTracker.setActiveActivity(activity);
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
            this.activeActivityMenuItem.setOrnament(Ornament.NONE);
        }

        this.activitiesMenu.label.text = "Activities ("+this.activeActivity["name"]+")";
        this.activitiesMenu.setSubmenuShown(false);
        this.activeActivityMenuItem = this.activityMenuItemsById[this.activeActivity["id"]];
        this.activeActivityMenuItem.setOrnament(Ornament.CHECK);

        if(this.activeIssue)
            this.startTracking();

        //this.updateActiveIssueLabel();
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
                let menuItem = new IssueButton(issue);
                this.issueMenuItems.push(menuItem);
                this.issuesMenu.addMenuItem(menuItem);
                this.issueMenuItemsById[issue["id"]] = menuItem;

                //listen for click events
                menuItem.connect('activate', Lang.bind(this, function(widget) {
                    timeTracker.setActiveIssue(issue);
                }));
            }
        }

        if(!hasIssue){
            let empty = new PopupMenu.PopupMenuItem("empty", {reactive:false, activate:false});
            this.issueMenuItems.push(empty);
            this.issuesMenu.addMenuItem(empty);
        }
    },

    setActiveIssue: function(issueData){
        if(!issueData){
            this.activeIssue = null;
            this.updateActiveIssueLabel();
            return;
        }
        if(this.isTracking && this.activeIssue && this.activeIssue["id"] == issueData["id"])
            return;

        if(this.activeIssueMenuItem != null){
            this.activeIssueMenuItem.setOrnament(Ornament.NONE);
        }

        this.activeIssue = issueData;


        this.activeIssueMenuItem = this.issueMenuItemsById[this.activeIssue["id"]]
        this.activeIssueMenuItem.setOrnament(Ornament.CHECK);

        if(this.activeActivity)
            this.startTracking();

        //this.updateActiveIssueLabel();
    },

    setActiveTimeEntry: function(timeEntry){
        this.activeTimeEntry = timeEntry;
    },

    notifyActiveIssue: function(title){
        if(!this.activeIssue)
            return;

        if(!this.activeActivity)
            return;

        this.notification.update(title, this.activeIssue["subject"]+" ("+this.activeActivity["name"]+")");
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
        if(this.settings.get_boolean('show-project-name-in-status'))
            txt = this.activeIssue["project"]["name"];

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

        this.updateActiveIssueLabel();

        //show the activity entry
        this.activityDescription.entry.text = "";
        this.activityDescription.show();

        //notify
        this.notifyActiveIssue("started");
    },

    stopTracking: function(){
        this.trackingSwitch.setToggleState(false);

        if(!this.isTracking)
            return;

        this.activeTimeEntry["comments"] = this.activityDescription.entry.text;

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

        this.activityDescription.entry.text = "";
        this.activityDescription.hide();

        //notify
        this.notifyActiveIssue("stopped");
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

        timeTracker.activeTimeEntry["comments"] = timeTracker.activityDescription.entry.text;

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
