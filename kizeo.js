const root = 'https://www.kizeoforms.com/rest/v3/';

const request = require('request');

module.exports = {
    login: function (company, user, password, done) {
        var options = {
            uri: root + 'login',
            method: 'POST',
            json: {
                "user": user,
                "password": password,
                "company": company
            }
        };

        console.log(options.method + ' ' + options.uri);
        request(options, function (error, response, body) {
            done(error, body);
        });
    },

    users: function(token, done) {
        var options = {
            uri: root + 'users',
            method: 'GET',
            headers: {
                'Authorization': token
            }
        };

        console.log(options.method + ' ' + options.uri);
        request(options, function (error, response, body) {
            if (!error) {
                body = JSON.parse(body);
            }
            done(error, body);
        });
    },

    push: function(token, formId, recipientId, fields, done) {
        var options = {
            uri: root + 'forms/' + formId + '/push',
            method: 'POST',
            headers: {
                'Authorization': token
            },
            json: {
                "recipient_user_id": recipientId,
                "fields": fields
            }
        };

        console.log(options.method + ' ' + options.uri);
        request(options, function (error, response, body) {
            done(error, body);
        });
    },

    postMedia: function(token, formId, name, data, done) {
        var options = {
            uri: root + 'forms/' + formId + '/medias/' + name,
            method: 'POST',
            headers: {
                'Authorization': token
            },
            body: data
        };

        console.log(options.method + ' ' + options.uri);
        request(options, function (error, response, body) {
            done(error, body);
        });
    },

}