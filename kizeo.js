const root = 'https://www.kizeoforms.com/rest/v3/';
const company = 'CEECON';

const request = require('request');

module.exports = {
    login: function (user, password, done) {
        var options = {
            uri: root + 'login',
            method: 'POST',
            json: {
                "user": user,
                "password": password,
                "company": company
            }
        };

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

        request(options, function (error, response, body) {
            done(error, body);
        });

    }
}