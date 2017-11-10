/**
 * Created by phwhitfield on 2/25/14.
 */
const St = imports.gi.St;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
//const Separator = imports.ui.separator;
//Nao estava antes - const Me = imports.misc.extensionUtils.getCurrentExtension();
//const Atk = imports.gi.Atk;
const GLib = imports.gi.GLib;
const Notify = imports.gi.Notify;
const MessageTray = imports.ui.messageTray;
const Shell = imports.gi.Shell;


const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const API = Me.imports.redmineAPI;
const Elements = Me.imports.elements;
const convenience = Me.imports.convenience;
const Separator = Me.imports.separator;

const Ornament = {
    NONE: 0,
    DOT: 1,
    CHECK: 2
};

function openURL(uri){
    Gio.app_info_launch_default_for_uri(
        uri,
        global.create_app_launch_context()
    );
    timeTracker.menu.close();
}

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
}

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
        this.actor.x_expand = false;
    },

    //override the default release event to catch left clicks
    _onButtonReleaseEvent: function(actor, event){
        let button = event.get_button();
        if(button == 3 || button == 2){
            openURL(timeTracker.settings.get_string('host')+"projects/"+this.data["id"]);
        }else{
            timeTracker.setActiveProject(this.data);
            this.activate(event);
        }
        return true;
    },

    setChecked: function(state){
        //Gnome 3.6 & 3.8
        if(typeof this.setShowDot === "function") {
            this.setShowDot(state);
        }
        //Gnome 3.10 & newer
        if(typeof this.setOrnament === "function") {
            if(state)
                this.setOrnament(Ornament.DOT);
            else
                this.setOrnament(Ornament.NONE);
        }
    }
});

const ProjectParentButton = new Lang.Class({
    Name: 'ProjectParentButton',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function(data){
        this.data = data;
        this.parent(data["name"], false);
        this.label.style_class = 'time-tracker-project-btn';
        this.actor.x_expand = false;
    },

    //override the default release event to catch left clicks
    _onButtonReleaseEvent: function(actor, event){
        let button = event.get_button();
        if(button == 3 || button == 2){
            openURL(timeTracker.settings.get_string('host')+"projects/"+this.data["id"]);
        }else{
            timeTracker.setActiveProject(this.data);
            this.activate(event);
        }
        return true;
    },

    setChecked: function(state){
        //Gnome 3.6 & 3.8
        if(typeof this.setShowDot === "function") {
            this.setShowDot(state);
        }
        //Gnome 3.10 & newer
        if(typeof this.setOrnament === "function") {
            if(state)
                this.setOrnament(Ornament.DOT);
            else
                this.setOrnament(Ornament.NONE);
        }
    }
});

const ActivityButton = new Lang.Class({
    Name: 'ProjectButton',
    Extends: BaseButton,

    _init: function(data){
        this.data = data;
        this.parent(data["name"], {style_class: 'time-tracker-activity-btn'});
    },

    setChecked: function(state){
        //Gnome 3.6 & 3.8
        if(typeof this.setShowDot === "function") {
            this.setShowDot(state);
        }
        //Gnome 3.10 & newer
        if(typeof this.setOrnament === "function") {
            if(state)
                this.setOrnament(Ornament.CHECK);
            else
                this.setOrnament(Ornament.NONE);
        }
    }
});

const IssueButton = new Lang.Class({
    Name: 'IssueButton',
    Extends: BaseButton,

    _init: function(data){
        this.data = data;
        let labelTxt = data["subject"];
        if(data["priority"] != null){
            if(data["priority"]["name"].toLowerCase() == "immediate"){
                labelTxt = "♦♦♦ "+labelTxt;
            }else if(data["priority"]["name"].toLowerCase() == "urgent"){
                labelTxt = "♦♦ "+labelTxt;
            }else if(data["priority"]["name"].toLowerCase() == "high"){
                labelTxt = "♦ "+labelTxt;
            }
            /*else if(data["priority"]["name"].toLowerCase() == "normal"){
             labelTxt = "# "+labelTxt;
             }*/
        }
        this.parent(labelTxt, {style_class: 'time-tracker-issue-btn'});

        //listen for click events
        this.connect('activate', Lang.bind(this, function(event) {
            timeTracker.setActiveIssue(event.data);
        }));
    },

    //override the default release event to catch left clicks
    _onButtonReleaseEvent: function(actor, event){
        let button = event.get_button();
        if(button == 3 || button == 2){
            openURL(timeTracker.settings.get_string('host')+"issues/"+this.data["id"]);
        }else{
            this.activate(event);
        }
        return true;
    },

    setChecked: function(state){
        //Gnome 3.6 & 3.8
        if(typeof this.setShowDot === "function") {
            this.setShowDot(state);
        }
        //Gnome 3.10 & newer
        if(typeof this.setOrnament === "function") {
            if(state)
                this.setOrnament(Ornament.CHECK);
            else
                this.setOrnament(Ornament.NONE);
        }
    }
});

var entryMenuItemDefault = "What are you doing?";
const EntryMenuItem = new Lang.Class({
    Name: 'EntryMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(){
        this.parent({reactive: false});
        this.entry = new St.Entry({name: 'searchEntry',
            can_focus: true,
            track_hover: false,
            hint_text: entryMenuItemDefault,
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

const CreateIssueMenuItem = new Lang.Class({
    Name: 'CreateIssueMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(){
        this.parent({reactive: false});
        this.entry = new St.Entry({name: 'searchEntry',
            can_focus: true,
            track_hover: false,
            hint_text: _("Create new Issue"),
            style_class: 'time-tracker-create-issue-entry',
            x_expand: true
        });

        this.actor.add(this.entry);
    },

    show: function(){
        this.actor.show();
    },

    hide: function(){
        this.actor.hide();
    }
});

const SearchMenuItem = new Lang.Class({
    Name: 'SearchMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(){
        this.parent({reactive: false, activate: false});
        this.entry = new St.Entry({name: 'searchEntry',
            can_focus: true,
            track_hover: false,
            hint_text: _("Search"),
            style_class: 'time-tracker-search-entry',
            x_expand: true
        });

        this.entry.connect('key_release_event', Lang.bind(this, function(actor, event) {
            //log(actor.text);
            timeTracker.searchFor(actor.text);
        }));

        this.actor.add(this.entry);
    },
    /*
     _onKeyPressEvent: function(actor, event){
     log(event.get_key_symbol());
     },
     */

    clear: function(){
        this.entry.text = "";
    },

    focus: function(){
        this.entry.grab_key_focus();
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
        this.middlePane = new St.BoxLayout({ style_class: 'time-tracker-menu-middle-pane', x_expand: true, y_expand: true});

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
        this.projectsMenu.actor.x_expand = false;
        this.projectsMenu.actor.y_expand = false;
        this.middlePane.add(this.projectsMenu.actor, {x_expand: false, y_expand: false});

        ///////////////////////////////////////////////////
        this.projectsAndIssuesSeparator = new St.DrawingArea({ style_class: 'calendar-vertical-separator', pseudo_class: 'highlighted' });
        this.projectsAndIssuesSeparator.connect('repaint', Lang.bind(this, _onVertSepRepaint));
        this.middlePane.add(this.projectsAndIssuesSeparator, {expand: false});

        ///////////////////////////////////////////////////
        this.activitiesAndIssuesMenu = new PopupMenu.PopupMenuSection();
        fakeMenu = new FakeMenu(this.activitiesAndIssuesMenu.actor);
        //hack to avoid error on open submenu
        this.activitiesAndIssuesMenu._setParent(fakeMenu);
        this.activitiesMenu = new PopupMenu.PopupSubMenuMenuItem("Activities", false);
        this.activitiesAndIssuesMenu.addMenuItem(this.activitiesMenu);
        //rightPane.add(this.activitiesMenuParent.actor, {expand: false, x_align:St.Align.START});

        separator = new PopupMenu.PopupSeparatorMenuItem();
        this.activitiesAndIssuesMenu.addMenuItem(separator);
        //rightPane.add(separator.actor);

        this.issuesMenuMine = new PopupMenu.PopupMenuSection();
        this.activitiesAndIssuesMenu.addMenuItem(this.issuesMenuMine);
        this.issuesMineSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.activitiesAndIssuesMenu.addMenuItem(this.issuesMineSeparator);
        this.issuesMenu = new PopupMenu.PopupMenuSection();
        this.activitiesAndIssuesMenu.addMenuItem(this.issuesMenu);

        this.issuesMenuMine.actor.hide();
        this.issuesMineSeparator.actor.hide();
        this.issuesMenu.actor.hide();

        this.createIssueEntry = new CreateIssueMenuItem();
        this.activitiesAndIssuesMenu.addMenuItem(this.createIssueEntry);
        //this.createIssueEntry.hide();
        this.createIssueEntry.entry.clutter_text.connect('key-release-event', function(textItem, evt){
            let symbol = evt.get_key_symbol();
            let txt = textItem.get_text();
            if(symbol == Clutter.Return){
                timeTracker.createIssue(txt);
            }
        });

        /*
         this.issuesMenuScroll = new St.ScrollView({ x_fill: true, y_fill: true, y_align: St.Align.START, style_class: 'time-tracker-projects-scroll-container' });
         this.issuesMenuScroll.add_child(this.issuesMenu.actor);
         middlePane.add(this.issuesMenuScroll, {expand: true, x_align:St.Align.START});
         */
        //rightPane.add(this.issuesMenu.actor, {expand: true, x_align:St.Align.START});
        this.middlePane.add(this.activitiesAndIssuesMenu.actor, {expand: true, x_align:St.Align.START});

        this.mainBox.add_actor(this.middlePane, {expand: true, x_align:St.Align.START});

        /////////////////////////////////////////////////////////////////////////////////////////////////////search area
        this.searchMenu = new PopupMenu.PopupMenuSection({ style_class: 'time-tracker-search-pane' });
        this.searchEntry = new SearchMenuItem();
        this.searchMenu.addMenuItem(this.searchEntry);
        this.mainBox.add(this.searchMenu.actor);
        this.searchMenu.actor.hide();


        /////////////////////////////////////////////////////////////////////////////////////////////////////build the bottom pane
        let searchBtn = new Elements.Button('preferences-system-search-symbolic', null, {style_class: 'time-tracker-refresh-btn'});
        searchBtn.connect('activate', Lang.bind(this, function() {
            timeTracker.toggleSearch();
        }));
        bottomPane.add(searchBtn.actor);

        let refreshBtn = new Elements.Button('view-refresh-symbolic', null, {style_class: 'time-tracker-refresh-btn'});
        refreshBtn.connect('activate', Lang.bind(this, function() {
            timeTracker.reload();
        }));
        bottomPane.add(refreshBtn.actor);

        let browserBtn = new Elements.Button('network-server-symbolic', null, {style_class: 'time-tracker-browser-btn'});
        browserBtn.connect('activate', Lang.bind(this, function() {
            openURL(timeTracker.settings.get_string('host'));
        }));
        bottomPane.add(browserBtn.actor, {expand: false, x_align:St.Align.START});

        let prefSpacer = new St.Label({text: ' '});
        bottomPane.add(prefSpacer, {expand: true});

        let prefBtn = new Elements.Button('preferences-system-symbolic', null, {style_class: 'time-tracker-settings-btn'});
        prefBtn.connect('activate', Lang.bind(this, function() {
            Main.Util.trySpawnCommandLine("gnome-shell-extension-prefs redmine_time_tracker@undef.ch");
            timeTracker.menu.close();
        }));
        bottomPane.add(prefBtn.actor, {expand: false, x_align:St.Align.END});


        /////////////////////////////////////////////////////////////////////////////////////////////////////build the menu
        separator = new Separator.HorizontalSeparator({ style_class: 'popup-separator-menu-item' });
        this.mainBox.add_actor(separator.actor);
        this.mainBox.add_actor(bottomPane, {expand: false, x_align:St.Align.START});

        section.actor.add_actor(this.mainBox);
        this.menu.addMenuItem(section);

        //this.menu.actor.min_width = 550;
        this.menu.actor.set_width(640);

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
        this.allIssues = [];
        this.searchResults = [];
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

        //register shortcut
        Main.wm.addKeybinding(
            "show-search-shortcut",
            this.settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.MESSAGE_TRAY | Shell.ActionMode.OVERVIEW,
            Lang.bind(this, function() {
                timeTracker.menu.open();
                timeTracker.showSearch();
            })
        );
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
        this.stopTracking();

        this.activityDescription.hide();
        this.createIssueEntry.hide();
        this.activitiesAndIssuesMenu.actor.show();
        this.projectsAndIssuesSeparator.show();

        this.allIssues = [];
        this.activeActivity = null;
        this.activeProject = null;
        this.activeIssue = null;
        if(this.activeIssueMenuItem)
            this.activeIssueMenuItem.setChecked(false);
        if(this.activeProjectMenuItem)
            this.activeProjectMenuItem.setChecked(false);
        if(this.activeActivityMenuItem)
            this.activeActivityMenuItem.setChecked(false);
        if(this.openProjectParent)
            this.openProjectParent.setSubmenuShown(false);

        this.clearProjectList();
        this.clearIssueList();
        let empty = new Elements.Button("view-refresh-symbolic", "loading...", {reactive:false, activate:false, can_focus: false});
        empty.setSensitive(false);
        this.projectMenuItems.push(empty);
        this.projectsMenu.addMenuItem(empty);

        //load user data first and then the rest
        API.getCurrentUser(function(user){
            timeTracker.user = user;
            API.getAllProjects(function(projects){timeTracker.setProjectList(projects);});
            API.getAllActivities(function(activities){timeTracker.setActivitiesList(activities);});
            API.getAllIssues(function(issues){timeTracker.allIssues = issues;});
        }, function(error){
            timeTracker.setProjectListError();
        });
    },

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    getProjectById: function(projectId){
        for(let i=0; i<this.projects.length; i++){
            if(this.projects[i]["id"] == projectId)
                return this.projects[i];
        }
        return null;
    },

    clearProjectList: function(){
        for(let i=0; i<this.projectMenuItems.length; i++){
            this.projectMenuItems[i].destroy();
        }

        this.projectMenuItems = [];
        this.projectMenuItemsById = {};
    },

    setProjectListError: function(){
        this.clearProjectList();

        let empty = new Elements.Button("dialog-error-symbolic", "Error loading projects. Check your preferences.", {style_class: "time-tracker-project-load-error", reactive:false, activate:false});
        this.projectMenuItems.push(empty);
        this.projectsMenu.addMenuItem(empty);

        this.activitiesAndIssuesMenu.actor.hide();
        this.projectsAndIssuesSeparator.hide();
    },

    setProjectList: function(projects){
        this.clearProjectList();

        this.projectsMenu.actor.x_expand = false;
        this.projectsMenu.actor.y_expand = false;

        //filter closed projects
        for(let i=0; i<projects.length; i++){
            let project = projects[i];
            if(project["status"] == 1){
                this.projects.push(project);
            }
        }

        //this.projects = projects;

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
                    }));
                }else{
                    menuItem = new ProjectButton(project);
                    /*
                     menuItem.connect('activate', Lang.bind(this, function(widget) {
                     timeTracker.setActiveProject(project);
                     }));
                     */
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

    setActiveProject: function(projectData, callback){
        if(this.activeProject && this.activeProject["id"] == projectData["id"])
            return;

        this.activeProject = projectData;
        this.loadIssues(projectData["id"], callback);
        if(this.activeProjectMenuItem != null){
            this.activeProjectMenuItem.setChecked(false);
        }
        let widget = this.projectMenuItemsById[projectData["id"]];
        if(!widget)
            return;

        widget.setChecked(true);

        timeTracker.activeProjectMenuItem = widget;

        if(!this.isTracking){
            this.createIssueEntry.show();
            this.updateActiveIssueLabel();
            this.setActiveIssue(null);
        }
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
            this.activeActivityMenuItem.setChecked(false);
        }

        this.activitiesMenu.label.text = "Activities ("+this.activeActivity["name"]+")";
        this.activitiesMenu.setSubmenuShown(false);
        this.activeActivityMenuItem = this.activityMenuItemsById[this.activeActivity["id"]];
        this.activeActivityMenuItem.setChecked(true);

        if(this.activeIssue)
            this.startTracking();


        //this.updateActiveIssueLabel();
    },


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    loadIssues: function(projectId, callback){
        this.clearIssueList();
        let empty = new Elements.Button("view-refresh-symbolic", "loading...", {reactive:false, activate:false, can_focus: false});
        empty.setSensitive(false);
        this.issueMenuItems.push(empty);
        this.issuesMenu.addMenuItem(empty);
        API.getIssuesFromProject(projectId, function(issues){timeTracker.setIssueList(issues);if(callback){callback();}});
    },

    clearIssueList: function(){
        for(let i=0; i<this.issueMenuItems.length; i++){
            this.issueMenuItems[i].destroy();
        }
        this.issueMenuItems = [];
        this.issueMenuItemsById = {};
    },

    setIssueList: function(issues){

        function compareSubject(a,b) {
            let subjectA = a.subject.toLowerCase();
            let subjectB = b.subject.toLowerCase();
            if (subjectA < subjectB)
                return -1;
            if (subjectA > subjectB)
                return 1;
            return 0;
        }

        this.clearIssueList();

        let hasIssue = false;
        let hasIssueMine = false;
        let hasIssueOther = false;

        issues.sort(compareSubject);

        this.issues = issues;

        for(let i=0; i<this.issues.length; i++){
            let issue = this.issues[i];

            //filter subproject issues
            if(issue['project']['id'] == this.activeProject["id"]){
                hasIssue = true;
                let mine = false;
                if(issue['assigned_to'] != null){
                    if(issue['assigned_to'].id == this.user.id){
                        mine = true;
                        hasIssueMine = true;
                    }
                }
                if(!mine)
                    hasIssueOther = true;
                this.addIssue(issue, mine);
            }
        }

        if(!hasIssue){
            let empty = new PopupMenu.PopupMenuItem("empty", {reactive:false, activate:false, can_focus: false});
            empty.setSensitive(false);
            this.issueMenuItems.push(empty);
            this.issuesMenu.addMenuItem(empty, false);
        }

        if(hasIssueMine){
            this.issuesMenuMine.actor.show();
            this.issuesMineSeparator.actor.show();
        }else{
            this.issuesMenuMine.actor.hide();
            this.issuesMineSeparator.actor.hide();
        }

        if(hasIssueOther){
            this.issuesMenu.actor.show();
        }else{
            this.issuesMenu.actor.hide();
            this.issuesMineSeparator.actor.hide();
        }

        this.createIssueEntry.show();
    },

    addIssue: function(issue, mine){
        let menuItem = new IssueButton(issue);
        this.issueMenuItems.push(menuItem);
        if(mine){
            this.issuesMenuMine.addMenuItem(menuItem);
        }else{
            this.issuesMenu.addMenuItem(menuItem);
        }
        this.issueMenuItemsById[issue["id"]] = menuItem;
    },

    createIssue: function(issueSubject){
        if(!this.activeProject)
            return;

        this.createIssueEntry.entry.text = "";
        API.createIssue({project_id: this.activeProject["id"], subject: issueSubject, assigned_to_id: this.user["id"]}, function(issueData){
            //timeTracker.loadIssues(timeTracker.activeProject["id"]);
            timeTracker.allIssues.push(issueData);
            timeTracker.addIssue(issueData);
            //timeTracker.setActiveIssue(issueData);
        });
    },

    setActiveIssue: function(issueData){
        if(!issueData){
            this.stopTracking();
            this.activeIssue = null;
            this.updateActiveIssueLabel();
            return;
        }
        if(this.isTracking && this.activeIssue && this.activeIssue["id"] == issueData["id"])
            return;

        if(this.activeIssueMenuItem != null){
            this.activeIssueMenuItem.setChecked(false);
        }

        this.activeIssue = issueData;


        this.activeIssueMenuItem = this.issueMenuItemsById[this.activeIssue["id"]]
        this.activeIssueMenuItem.setChecked(true);

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

        this.notification.update(title, this.activeIssue["subject"]+" ("+this.activeActivity["name"]+")");
        this.source.notify(this.notification);
    },

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    showSearch: function(){

        this.clearSearch();
        //this.searchMenu.actor.set_height(this.middlePane.get_height());
        this.middlePane.hide();
        this.searchMenu.actor.show();
        this.searchIsVisible = true;

        this.searchEntry.focus();
        /*
         for(let i=0;i<20;i++){
         let empty = new PopupMenu.PopupMenuItem("empty", {reactive:false, activate:false, can_focus: false});
         empty.setSensitive(false);
         this.searchMenu.addMenuItem(empty);
         }
         */
    },

    hideSearch: function(){
        this.searchMenu.actor.hide();
        this.middlePane.show();
        this.searchIsVisible = false;
    },

    toggleSearch: function(){
        if(this.searchIsVisible){
            this.hideSearch();
        }else{
            this.showSearch();
        }
    },

    clearSearch: function(){
        this.searchEntry.clear();
    },

    clearSearchResults: function(){
        for(let i=0; i<this.searchResults.length; i++){
            this.searchResults[i].destroy();
        }

        this.searchResults = [];
    },

    searchFor: function(query){
        this.clearSearchResults();

        if(query.length < 2)
            return;

        query = query.toLowerCase();

        let projectSearchResults = [];
        for(let i=0; i<this.projects.length; i++){
            if(this.projects[i]["name"].toLowerCase().search(query) != -1){
                projectSearchResults.push(this.projects[i]);
            }
        }

        /*
         let item = new PopupMenu.PopupMenuItem("PROJECTS", {reactive:false, activate:false, can_focus: false, style_class: "time-tracker-search-title"});
         this.searchResults.push(item);
         this.searchMenu.addMenuItem(item);
         */
        for(let i=0; i<projectSearchResults.length; i++){
            let project = projectSearchResults[i];
            let item = new PopupMenu.PopupMenuItem(project["name"]);
            item.connect('activate', Lang.bind(this, function(widget) {
                timeTracker.hideSearch();
                timeTracker.setActiveProject(project);
            }));
            this.searchResults.push(item);
            this.searchMenu.addMenuItem(item);
        }
        if(projectSearchResults.length == 0){
            let item = new PopupMenu.PopupMenuItem("no projects", {reactive:false, activate:false, can_focus: false, style_class: "time-tracker-search-title"});
            this.searchResults.push(item);
            this.searchMenu.addMenuItem(item);
        }

        //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        let item = new PopupMenu.PopupSeparatorMenuItem();
        this.searchResults.push(item);
        this.searchMenu.addMenuItem(item);

        //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        let issueSearchResults = [];
        for(let i=0; i<this.allIssues.length; i++){
            if(this.allIssues[i]["subject"].toLowerCase().search(query) != -1 || this.allIssues[i]["project"]["name"].toLowerCase().search(query) != -1){
                issueSearchResults.push(this.allIssues[i]);
            }
        }
        /*
         item = new PopupMenu.PopupMenuItem("ISSUES", {reactive:false, activate:false, can_focus: false, style_class: "time-tracker-search-title"});
         this.searchResults.push(item);
         this.searchMenu.addMenuItem(item);
         */
        for(let i=0; i<issueSearchResults.length; i++){
            let issue = issueSearchResults[i];
            if(issue["project"]){
                let item = new PopupMenu.PopupMenuItem(issue["subject"]+" ("+issue["project"]["name"]+")");
                item.connect('activate', Lang.bind(this, function(widget) {
                    timeTracker.hideSearch();
                    timeTracker.setActiveProject(timeTracker.getProjectById(issue["project"]["id"]), function(){
                        timeTracker.setActiveIssue(issue);
                    });
                }));
                this.searchResults.push(item);
                this.searchMenu.addMenuItem(item);
            }
        }
        if(issueSearchResults.length == 0){
            let item = new PopupMenu.PopupMenuItem("no issues", {reactive:false, activate:false, can_focus: false, style_class: "time-tracker-search-title"});
            this.searchResults.push(item);
            this.searchMenu.addMenuItem(item);
        }
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

        this.createIssueEntry.hide();

        //notify
        this.notifyActiveIssue("started");
    },

    stopTracking: function(){
        this.trackingSwitch.setToggleState(false);

        if(!this.isTracking)
            return;

        if(this.activeTimeEntry)
            if(timeTracker.activityDescription.entry.text != entryMenuItemDefault)
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

        if(this.activeProject)
            this.createIssueEntry.show();

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
        if(timeTracker.activityDescription.entry.text != entryMenuItemDefault)
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

        if(timeTracker.activityDescription.entry.text != entryMenuItemDefault)
            timeTracker.activeTimeEntry["comments"] = timeTracker.activityDescription.entry.text;

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
    shutdown: function(){
        Notify.uninit();
        this.destroy();
    }
});


/************************* ENABLE **********************************/
function init(extension) {
}

function enable() {
    timeTracker = new TimeTracker();
}

function disable() {
    timeTracker.shutdown();
}
