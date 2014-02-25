/**
 * Created by phwhitfield on 2/25/14.
 */
const Soup = imports.gi.Soup;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const convenience = Me.imports.convenience;

const session = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());

var settings = convenience.getSettings();

//URL used to make API calls
function Url(path,data){
    this._init(path,data);
}

Url.prototype = {
    _init: function(path,data) {
        this._path = path;
        this._data = data;
    },

    toString: function() {
        let url = settings.get_string('host') + this._path + '?key=' + settings.get_string('key');
        let params = [];
        for(let param in this._data)
            params.push(param + "=" + this._data[param]);

        if(params.length > 0){
            url = url + '&' + params.join('&');
        }
        return url;
    }

}

function getAllProjects(callback){
    let url = new Url('projects.json');
    let request = Soup.Message.new('GET',url.toString());
    session.queue_message(request, function() {
        let projects = JSON.parse(request.response_body.data)['projects'];
        callback(projects);
    })
};

function getAllIssues(callback){
    let data = {};
    //check for filter
    if(this.settings.get_boolean("filter-assigned-to-me"))
        data['assigned_to_id'] = 'me';

    let url = new Url('issues.json', data);
    let request = Soup.Message.new('GET', url.toString());
    session.queue_message(request, function() {
        let issues = JSON.parse(request.response_body.data)['issues'];
        callback(issues);
    })
};

function getIssuesFromProject(projectId, callback){
    let data = {};
    data["project_id"] = projectId;
    //check for filter
    if(this.settings.get_boolean("filter-assigned-to-me"))
        data['assigned_to_id'] = 'me';

    let url = new Url('issues.json', data);
    let request = Soup.Message.new('GET', url.toString());
    session.queue_message(request, function() {
        let issues = JSON.parse(request.response_body.data)['issues'];
        callback(issues);
    })
};