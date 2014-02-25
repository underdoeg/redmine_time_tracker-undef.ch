/**
 * Created by phwhitfield on 2/25/14.
 */
const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;


let message;

function hideMessage() {
    Main.uiGroup.remove_actor(message);
    message = null;
}

function showMessage(msgText) {
    if (!message) {
        message = new St.Label({ style_class: 'time-tracker-message', text: msgText });
        Main.uiGroup.add_actor(message);
    }

    message.opacity = 255;

    let monitor = Main.layoutManager.primaryMonitor;

    message.set_position(Math.floor(monitor.width / 2 - message.width / 2),
        Math.floor(monitor.height / 2 - message.height / 2));

    Tweener.addTween(message,
        { opacity: 0,
            time: 2,
            transition: 'easeOutQuad',
            onComplete: hideMessage });
}

const Button = new Lang.Class({
    Name: 'TimeTracker.Button',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(iconName, labelText, data) {
        this.parent(data);

        if (iconName) {
            this.icon = new St.Icon({icon_name: iconName, icon_size: 12});
            //this.icon = new St.Icon({icon_name: iconName});
            this.actor.add(this.icon, {x_fill: false, y_fill: false,x_align: St.Align.START, y_align: St.Align.MIDDLE});
        }

        if (labelText) {
            this.label = new St.Label({ text: labelText });
            this.actor.add(this.label, {x_fill: false, y_fill: true,x_align: St.Align.MIDDLE, y_align: St.Align.START});
        }
    }
});
Signals.addSignalMethods(Button.prototype);
