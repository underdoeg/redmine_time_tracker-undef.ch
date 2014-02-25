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
const Atk = imports.gi.Atk;


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

//the global TimeTracker object
var timeTracker;
/************************* CONTROLLER **********************************/

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
    }
});

/************************* MAIN MENU CONTAINER **********************************/



/*
const TimeTrackerMainArea = new Lang.Class({
    Name: 'TimeTrackerMainArea',
    Extends: PopupMenu.PopupMenu,

    init: function(){
        this.parent(this.actor, menuAlignment, St.Side.TOP, 0);
    }
});
*/

/************************* CONTROLLER **********************************/
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


        /////////////////////////////////////////////////////////////////////////////////////////////////////build the top pane
        //this.activeIssueLabel = new St.Label({text: 'No issue selected!'});
        this.activeIssueLabel = new PopupMenu.PopupMenuItem("\u25BE No issue selected \u25BE", { style_class: 'time-tracker-active-issue'});
        topPane.add(this.activeIssueLabel.actor, {expand: true, x_align:St.Align.START});

        this.trackingSwitch = new PopupMenu.PopupSwitchMenuItem("", false, {});
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

        this.issuesMenu = new PopupMenu.PopupMenuSection();
        /*
        this.issuesMenuScroll = new St.ScrollView({ x_fill: true, y_fill: true, y_align: St.Align.START, style_class: 'time-tracker-projects-scroll-container' });
        this.issuesMenuScroll.add_child(this.issuesMenu.actor);
        middlePane.add(this.issuesMenuScroll, {expand: true, x_align:St.Align.START});
        */
        middlePane.add(this.issuesMenu.actor, {expand: true, x_align:St.Align.START});

        /////////////////////////////////////////////////////////////////////////////////////////////////////build the bottom pane
        let refreshBtn = new Elements.Button('refresh-symbolic', null, {style_class: 'time-tracker-refresh-btn'});
        refreshBtn.connect('activate', Lang.bind(this, function() {

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

        let prefBtn = new Elements.Button('control-center-alt-symbolic', null, {style_class: 'time-tracker-settings-btn'});
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
        //

        //and now load your data
        this.projects = [];
        this.projectMenuItems = [];
        this.projectMenuItemsById = {};
        this.activities = [];
        this.activityMenuItemsById = {};
        this.activityMenuItems = [];
        this.issues = [];
        this.issueMenuItems = [];
        this.activeProjectMenuItem = null;
        this.activeProject = null;
        this.activeIssue = null;
        this.activeActivity = null;
        this.activeActivityMenuItem = null;
        this.reload();
    },

    reload: function(){
        API.getAllProjects(function(projects){timeTracker.setProjectList(projects);});
        API.getAllActivities(function(activities){timeTracker.setActivitiesList(activities);});
    },

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    setProjectList: function(projects){
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

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    setActivitiesList: function(activities){
        this.activities = activities;
        for(let i=0; i<this.activities.length; i++){
            let activity = this.activities[i];
            let menuItem = new Elements.Button("media-playback-start-symbolic", activity["name"], {style_class: 'time-tracker-activities-btn'});
            menuItem.activityData = activity;
            menuItem.icon.hide();
            this.issuesMenu.addMenuItem(menuItem);
            this.activityMenuItemsById[activity["id"]] = menuItem;
            this.activityMenuItems.push(menuItem);
        }
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.issuesMenu.addMenuItem(separator);
        this.activityMenuItems.push(separator);
    },

    setActiveActivity: function(activityData){
        this.activeA
    },

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    loadIssues: function(projectId){
        API.getIssuesFromProject(projectId, function(issues){timeTracker.setIssueList(issues);});
    },

    setIssueList: function(issues){
        for(let i=0; i<this.issueMenuItems.length; i++){
            this.issueMenuItems[i].destroy();
        }
        this.issueMenuItems = [];

        this.issues = issues;
        for(let i=0; i<this.issues.length; i++){
            let issue = this.issues[i];

            //filter subproject issues
            if(issue['project']['id'] == this.activeProject["id"]){
                let menuItem = new PopupMenu.PopupMenuItem(issue["subject"], {});
                menuItem.issueData = issue;
                this.issueMenuItems.push(menuItem);
                this.issuesMenu.addMenuItem(menuItem);

                //listen for click events
                menuItem.connect('activate', Lang.bind(this, function(widget) {
                    timeTracker.setActiveIssue(widget.issueData);
                }));
            }
        }

        if(this.issues.length == 0){
            let empty = new PopupMenu.PopupMenuItem("Nothin to do! Good boy...", {reactive:false, activate:false});
            this.issueMenuItems.push(empty);
            this.issuesMenu.addMenuItem(empty);
            return;
        }
    },

    setActiveIssue: function(issueData){
        this.activeIssue = issueData;
        this.activeIssueLabel.label.text = this.activeIssue["subject"];
    },

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    destroy: function(){
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