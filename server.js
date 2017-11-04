const fs = require('fs');
const dateFormat = require('dateformat');
const db = require('sqlite');
const express = require('express');
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const requete = require('./requete');
const kizeo = require('./kizeo');

const server_port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080;
const server_ip_address = process.env.IP || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';
const data_dir = process.env.OPENSHIFT_DATA_DIR || '.';

const version = '1';

const formURL = 'https://cfsmsp.impots.gouv.fr/secavis/';

// Version 1 de l'application.
const appV1 = express();
appV1.locals.kizeoFormId = process.env.KIZEO_FORM_ID || '228400';
appV1.locals.kizeoCompany = process.env.KIZEO_COMPANY || 'CEECON';
appV1.locals.indexFile = __dirname + '/public/index.html';
appV1.locals.testData = __dirname + '/tests/testData.json';

// Version 2 de l'application
const appV2 = express();
appV2.locals.kizeoFormId = process.env.KIZEO_FORM_ID_V2 || '262802';
appV2.locals.kizeoCompany = process.env.KIZEO_COMPANY_V2 || 'CEECON1';
appV2.locals.indexFile = __dirname + '/public/index_v2.html';
appV2.locals.testData = __dirname + '/tests/testData.json';

// Application racine.
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ type: 'application/json' }));
app.use(cookieParser());

// Montage des versions 1 et 2.
app.use('/', appV1);
app.use('/v2', appV2);

var selectAvis; // SQL Statement pour la recherche d'avis dans la table.
var insertAvis; // SQL Statement pour l'insertion d'avis dans la table.

/**
 * Formulaire principal.
 */
function getRoot(req, res, next) {
  console.log('GET ' + req.baseUrl + '/');
  if (!req.cookies.kizeo_token || !req.cookies.kizeo_userId || req.cookies.version != version) {
    return res.status(403).redirect(req.baseUrl + '/identification');
  } else {
    return res.sendFile(req.app.locals.indexFile);
  }
}
appV1.get('/', getRoot);
appV2.get('/', getRoot);

/**
 * Formulaire d'dentification.
 */
function getIdentification(req, res, next) {
  console.log('GET ' + req.baseUrl + '/identification');
  return res.sendFile(__dirname + '/public/identification.html');
}
appV1.get('/identification', getIdentification);
appV2.get('/identification', getIdentification);

/**
 * Service d'identification.
 * 
 * Interroge l'API KIZEO avec les informations fournies, et positionne le cookie 'token' en cas de succès.
 */
function postIdentification(req, res, next) {
  console.log('POST ' + req.baseUrl + '/identification');
  if (!req.body.identifiant || !req.body.motDePasse) {
    return res.status(403).redirect(req.baseUrl + '/identification?erreur');
  }

  // Authentification via KIZEO.
  var login = req.body.identifiant;
  var password = req.body.motDePasse;
  kizeo.login(req.app.locals.kizeoCompany, login, password, function (err, result) {
    console.log(err, result);
    if (err || !result || !result.data || !result.data.token) {
      return res.status(403).redirect(req.baseUrl + '/identification?erreur');
    }

    // Récupère l'identifiant utilisateur pour la suite.
    var token = result.data.token;
    console.log(token);
    kizeo.users(token, function (err, result) {
      if (err || !result || !result.data || !result.data.users) {
        return res.status(403).redirect(req.baseUrl + '/identification?erreur');
      }
      for (var user of result.data.users) {
        if (user.login.toLowerCase() == login.toLowerCase()) {
          // Trouvé !
          return res
            .cookie('kizeo_token', token, { httpOnly: true, maxAge: 1000 * 60 * 60 * 12 /* 12h */ })
            .cookie('kizeo_userId', user.id)
            .cookie('version', version)
            .redirect(req.baseUrl + '/');
        }
      }
      return res.status(403).redirect(req.baseUrl + '/identification?erreur');
    });
  });
}
appV1.post('/identification', postIdentification);
appV2.post('/identification', postIdentification);

/**
 * Service web principal.
 */
function getRecherche(req, res, next) {
  console.log('GET ' + req.baseUrl + '/recherche');
  if (!req.cookies.kizeo_token || !req.cookies.kizeo_userId) {
    return res.status(403).json({
      code: 400,
      message: 'Authentification requise',
      explaination: 'Cette requête nécessite un jeton d\'authentification.'
    });
  } else if (!req.query.numeroFiscal || !req.query.referenceAvis) {
    // Paramètres manquants.
    return res.status(400).json({
      code: 400,
      message: 'Requête incorrecte',
      explaination: 'Les paramètres numeroFiscal et referenceAvis doivent être fournis dans la requête.'
    });
  }

  // Nettoyage des paramètres.
  var numeroFiscal = req.query.numeroFiscal.replace(/ /g, '').substring(0, 13);
  var referenceAvis = req.query.referenceAvis.replace(/ /g, '').substring(0, 13);
  if (numeroFiscal === '1234' && referenceAvis === '5678') {
    // Données de tests.
    fs.readFile(req.app.locals.testData, { encoding: 'utf-8' }, function (err, data) {
      if (err) {
        return next(err);
      }
      var result = JSON.parse(data);

      // Pousse les données vers KIZEO.
      req.app.locals.pousseFormulaire(req.cookies.kizeo_token, req.app.locals.kizeoFormId, req.cookies.kizeo_userId, numeroFiscal, referenceAvis, result, function (err) {
        if (err) {
          return next(err);
        }
        res.json(result);
      });
    });
  } else if (numeroFiscal === '1234' && referenceAvis === '1234') {
    // Données de tests.
    fs.readFile(req.app.locals.testData, { encoding: 'utf-8' }, function (err, data) {
      if (err) {
        return next(err);
      }
      var result = JSON.parse(data);
      res.json(result);
    });
  } else {
    // Détection des doublons.
    selectAvis.get([numeroFiscal, referenceAvis])
      .then(function (row) {
        if (row) {
          return res.status(400).json({
            code: 400,
            message: 'Requête dupliquée',
            explaination: 'Les références fiscales ont déjà été vérifiées.'
          });
        }

        // Exécution de la requête.
        requete(formURL, numeroFiscal, referenceAvis, function (err, result) {
          if (err && err.message === 'Invalid credentials') {
            return res.status(404).json({
              code: 404,
              message: 'Résultat non trouvé',
              explaination: 'Les paramètres fournis sont incorrects ou ne correspondent pas à un avis'
            });
          } else if (err) {
            return next(err);
          }

          // On renvoie les résultats.
          return res.json(result);
        });
      });
  }
}
appV1.get('/recherche', getRecherche);
appV2.get('/recherche', getRecherche);

/**
 * Service d'envoi de données au formulaire KIZEO.
 */
function postEnvoyer(req, res, next) {
  console.log('POST /envoyer');
  if (!req.cookies.kizeo_token || !req.cookies.kizeo_userId) {
    return res.status(403).json({
      code: 400,
      message: 'Authentification requise',
      explaination: 'Cette requête nécessite un jeton d\'authentification.'
    });
  }

  // Pousse les données vers KIZEO.
  var numeroFiscal = req.body.numeroFiscal;
  var referenceAvis = req.body.referenceAvis;
  var resultat = req.body.resultat;
  req.app.locals.pousseFormulaire(req.cookies.kizeo_token, req.app.locals.kizeoFormId, req.cookies.kizeo_userId, numeroFiscal, referenceAvis, resultat, function (err) {
    if (err) {
      return res.status(500).json({
        code: 500,
        message: 'Erreur KIZEO',
        explaination: err.message
      });
    }

    // Enregistre les références fiscales.
    insertAvis.run([numeroFiscal, referenceAvis])
      .then(function () {
        return res.send('OK');
      })
  });
}
appV1.post('/envoyer', postEnvoyer);
appV2.post('/envoyer', postEnvoyer);

/**
 * Pousse les données vers le formulaire KIZEO de l'application V1.
 * 
 * @param {string} token Jeton d'authentification
 * @param {string} formId Identifiant du formulaire
 * @param {string} recipientId Identifiant de l'utilisateur
 * @param {string} numeroFiscal Numéro fiscal
 * @param {string} referenceAvis Référence de l'avis d'imposition
 * @param {string} result Objet résultat
 * @param {*} done Callback
 */

appV1.locals.pousseFormulaire = function(token, formId, recipientId, numeroFiscal, referenceAvis, result, done) {
  // Génère le nom du fichier capture.
  var now = new Date();
  var timestamp = dateFormat(now, "yyyymmddHHMMss");
  var captureName = 'c32740f' + formId + 'pu' + recipientId + '_' + timestamp;

  // Nombre de persones dans le ménage.
  var nbPersonnes = 1 + (result.nombrePersonnesCharge || 0);
  if (result.declarant2 && result.declarant2.nom) {
    nbPersonnes++;
  }

  var fields = {
    "numero_fiscal": {
      "value": numeroFiscal
    },
    "reference_de_l_avis": {
      "value": referenceAvis
    },
    "nom": {
      "value": result.declarant1.nom
    },
    "prenom": {
      "value": result.declarant1.prenoms
    },
    "adresse": {
      "value": result.foyerFiscal.adresse
    },
    "code_postal": {
      "value": result.foyerFiscal.codePostal
    },
    "ville": {
      "value": result.foyerFiscal.ville
    },
    "photo3": {
      "value": captureName
    },
    "nombre_de_personne_dans_le_me": {
      "value": nbPersonnes
    },
  };

  // Envoie la capture d'écran.
  kizeo.postMedia(token, formId, captureName + '.jpg', result.capture, function (err) {
    if (err) {
      return done(err);
    }
    kizeo.push(token, formId, recipientId, fields, done);
  });
}

/**
 * Pousse les données vers le formulaire KIZEO de l'application V2.
 * 
 * @param {string} token Jeton d'authentification
 * @param {string} formId Identifiant du formulaire
 * @param {string} recipientId Identifiant de l'utilisateur
 * @param {string} numeroFiscal Numéro fiscal
 * @param {string} referenceAvis Référence de l'avis d'imposition
 * @param {string} result Objet résultat
 * @param {*} done Callback
 */

appV2.locals.pousseFormulaire = function(token, formId, recipientId, numeroFiscal, referenceAvis, result, done) {
  // Génère le nom du fichier capture.
  var now = new Date();
  var timestamp = dateFormat(now, "yyyymmddHHMMss");
  var captureName = 'c32740f' + formId + 'pu' + recipientId + '_' + timestamp;

  // Nombre de persones dans le ménage.
  var nbPersonnes = 1 + (result.nombrePersonnesCharge || 0);
  if (result.declarant2 && result.declarant2.nom) {
    nbPersonnes++;
  }

  // TODO
  var fields = {
    "numero_fiscal": {
      "value": numeroFiscal
    },
    "reference_de_l_avis": {
      "value": referenceAvis
    },
    "nom": {
      "value": result.declarant1.nom
    },
    "prenom": {
      "value": result.declarant1.prenoms
    },
    "adresse": {
      "value": result.foyerFiscal.adresse
    },
    "code_postal": {
      "value": result.foyerFiscal.codePostal
    },
    "ville": {
      "value": result.foyerFiscal.ville
    },
    "photo3": {
      "value": captureName
    },
    "nombre_de_personne_dans_le_me": {
      "value": nbPersonnes
    },
  };

  // Envoie la capture d'écran.
  kizeo.postMedia(token, formId, captureName + '.jpg', result.capture, function (err) {
    if (err) {
      return done(err);
    }
    kizeo.push(token, formId, recipientId, fields, done);
  });
}

/**
 * Purge de la table avis.
 */
app.get('/purge', function (req, res, next) {
  console.log('GET /purge');
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
db.open(data_dir + '/database.sqlite')
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
