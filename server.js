const db = require('sqlite');
const express = require('express');
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const requete = require('./requete');
const kizeo = require('./kizeo');

const server_port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080;
const server_ip_address = process.env.IP || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

const formURL = 'https://cfsmsp.impots.gouv.fr/secavis/';

const kizeoFormId = 228400;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

var selectAvis; // SQL Statement pour la recherche d'avis dans la table.
var insertAvis; // SQL Statement pour l'insertion d'avis dans la table.

/**
 * Formulaire principal.
 */
app.get('/', function (req, res, next) {
  if (!req.cookies.kizeo_token || !req.cookies.kizeo_userId) {
    return res.status(403).redirect('/identification');
  } else {
    return res.sendFile(__dirname + '/public/index.html');
  }
});

/**
 * Formulaire d'dentification.
 */
app.get('/identification', function (req, res, next) {
  return res.sendFile(__dirname + '/public/identification.html');
});

/**
 * Service d'i'dentification.
 * 
 * Interroge l'API KIZEO avec les informations fournies, et positionne le cookie 'token' en cas de succès.
 */
app.post('/identification', function (req, res, next) {
  if (!req.body.identifiant || !req.body.motDePasse) {
    return res.status(403).redirect('/identification?erreur');
  }

  // Authentification via KIZEO.
  var login = req.body.identifiant;
  var password = req.body.motDePasse;
  kizeo.login(login, password, function (err, result) {
    console.log(err, result);
    if (err || !result || !result.data || !result.data.token) {
      return res.status(403).redirect('/identification?erreur');
    }

    // Récupère l'identifiant utilisateur pour la suite.
    var token = result.data.token;
    console.log(token);
    kizeo.users(token, function (err, result) {
      if (err || !result || !result.data || !result.data.users) {
        return res.status(403).redirect('/identification?erreur');
      }
      for (var user of result.data.users) {
        if (user.login.toLowerCase() == login.toLowerCase()) {
          // Trouvé !
          res
            .cookie('kizeo_token', token)
            .cookie('kizeo_userId', user.id)
            .redirect('/');
        }
      }
      return res.status(403).redirect('/identification?erreur');
    });
  });
});

/**
 * Service web principal.
 */
app.get('/recherche', function (req, res, next) {
  if (!req.cookies.kizeo_token || !req.cookies.kizeo_userId) {
    return req.status(403).send({
      code: 400,
      message: 'Authentification requise',
      explaination: 'Cette requête nécessite un jeton d\'authentification.'
    });
  } else if (!req.query.numeroFiscal || !req.query.referenceAvis) {
    // Paramètres manquants.
    return res.status(400).send({
      code: 400,
      message: 'Requête incorrecte',
      explaination: 'Les paramètres numeroFiscal et referenceAvis doivent être fournis dans la requête.'
    });
  } else if (req.query.numeroFiscal === '1234' && req.query.referenceAvis === '5678') {
    // Données de tests.
    return res.sendFile(__dirname + '/tests/testData.json');
  } else {
    // Nettoyage des paramètres.
    var numeroFiscal = req.query.numeroFiscal.replace(/ /g, '').substring(0, 13);
    var referenceAvis = req.query.referenceAvis.replace(/ /g, '').substring(0, 13);

    // Détection des doublons.
    selectAvis.get([numeroFiscal, referenceAvis])
      .then(function (row) {
        if (row) {
          return res.status(400).send({
            code: 400,
            message: 'Requête dupliquée',
            explaination: 'Les références fiscales ont déjà été vérifiées.'
          });
        }

        // Exécution de la requête.
        requete(formURL, numeroFiscal, referenceAvis, function (err, result) {
          if (err && err.message === 'Invalid credentials') {
            return res.status(404).send({
              code: 404,
              message: 'Résultat non trouvé',
              explaination: 'Les paramètres fournis sont incorrects ou ne correspondent pas à un avis'
            });
          } else if (err) {
            return next(err);
          }

          // Enregistre les références fiscales.
          insertAvis.run([numeroFiscal, referenceAvis])
            .then(function () {
              res.json(result);
            })
        });
      });
  }
});

/**
 * Purge de la table avis.
 */
app.get('/purge', function (req, res, next) {
  db.run('DELETE FROM avis')
    .then(function () {
      res.send('OK');
    })
    .catch(function (err) {
      next(err);
    });
});

/*
 * Initalisation de l'application.
 */

// Ouverture/création DB pour stockage requêtes déjà effectuées.
db.open('./database.sqlite')
  .then(function () {
    // On applique les schémas de base.
    return db.migrate();
  })
  .then(function () {
    // Préparation des requêtes.
    // - Recherche;
    return db.prepare('SELECT * from avis WHERE numeroFiscal=? and referenceAvis=?');
  })
  .then(function (statement) {
    selectAvis = statement;

    // - Insertion.
    return db.prepare('INSERT INTO avis (numeroFiscal, referenceAvis) VALUES (?,?)');
  })
  .then(function (statement) {
    insertAvis = statement;

    // Démarrage du serveur Express.
    app.listen(server_port, server_ip_address, function () {
      console.log("Listening on " + server_ip_address + ", port " + server_port)
    });
  })
  .catch(function (err) {
    // Game over :(
    console.error(err.stack);
  });
