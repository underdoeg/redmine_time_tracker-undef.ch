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

function getCurrentUser(callback){
    let url = new Url('users/current.json');
    let request = Soup.Message.new('GET',url.toString());
    session.queue_message(request, function() {
        let user = JSON.parse(request.response_body.data)['user'];
        callback(user);
    })
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

function getAllActivities(callback){
    let url = new Url('/enumerations/time_entry_activities.json');
    let request = Soup.Message.new('GET', url.toString());
    session.queue_message(request, function() {
        let activities = JSON.parse(request.response_body.data)['time_entry_activities'];
        callback(activities);
    })
}

function createTimeEntry(issueId, activityId, callback){
    let url = new Url('time_entries.json');
    let data = {'time_entry':{issue_id:issueId, activity_id: activityId, user_id: 'me', hours: 0}};
    let dataStr = JSON.stringify(data);
    let request = Soup.Message.new('POST', url.toString());
    request.set_request("application/json", Soup.MemoryUse.COPY, dataStr, dataStr.length);
    session.queue_message(request, function() {
        let timeEntry = JSON.parse(request.response_body.data)['time_entry'];
        callback(timeEntry);
    });
}

function updateTimeEntry(timeEntry, callback){
    let url = new Url('time_entries/'+timeEntry["id"]+'.json');
    let data = {time_entry:{issue_id:timeEntry["issue"]["id"], activity_id: timeEntry["activity"]["id"], hours: timeEntry["hours"], comments: timeEntry["comments"]}};
    let dataStr = JSON.stringify(data);
    let request = Soup.Message.new('PUT', url.toString());
    request.set_request("application/json", Soup.MemoryUse.COPY, dataStr, dataStr.length);
    session.queue_message(request, function() {

    });
}

function deleteTimeEntry(timeEntry, callback){
    let url = new Url('time_entries/'+timeEntry["id"]+'.json');
    let request = Soup.Message.new('DELETE', url.toString());
    //request.set_request("application/json", Soup.MemoryUse.COPY, dataStr, dataStr.length);
    session.queue_message(request, function() {
        log(request.response_body.data);
        callback();
    });
}

function createIssue(data, callback){
    let url = new Url('issues.json');
    let dataStr = JSON.stringify({issue:{project_id:data["project_id"], assigned_to_id: data["assigned_to_id"], subject: data["subject"]}});
    let request = Soup.Message.new('POST', url.toString());
    request.set_request("application/json", Soup.MemoryUse.COPY, dataStr, dataStr.length);
    session.queue_message(request, function() {
       //log(request.response_body.data);
        callback(JSON.parse(request.response_body.data)['issue']);
    });
}