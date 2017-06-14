const phantom = require('phantom');

// Utilise les fonctions de svair-api pour le décodage.
const parseResponse = require('svair-api/utils/parse').result
const getYearFromReferenceAvis = require('svair-api/utils/year')

/**
 * Fonction principale du module: exécute la requête sur le serveur des impôts.
 * 
 * @param formURL URL du formulaire initial
 * @param numeroFiscal numéro fiscal
 * @param referenceAvis référence de l'avis d'imposition
 * @param done Callback, prend deux paramètres (err, result)
 */
module.exports = function (formURL, numeroFiscal, referenceAvis, done) {
    phantom.create()
        .then((instance) => {
            instance.createPage()
                .then((page) => {
                    // Simple logging
                    page.on("onResourceRequested", function (requestData) {
                        console.info('Requesting', requestData.url);
                    });
                    page.on("onResourceError", function (err) {
                        console.info('Error', err);
                    });
                    page.on("onConsoleMessage", function (msg) {
                        console.info('>>> ', msg);
                    });

                    // Ouvre la page du formulaire.
                    page.open(formURL)
                        .then((status) => {
                            return page.property('onLoadFinished');
                        })
                        .then(() => {
                            // Récupère les paramètres du formulaire.
                            return page.evaluate(function () {
                                var fields = {};
                                var form = document.getElementById('j_id_7');
                                for (var i = 0; i < form.elements.length; i++) {
                                    var e = form.elements[i];
                                    fields[e.name] = e.value;
                                }
                                return { fields: fields, action: form.action };
                            });
                        })
                        .then((form) => {
                            // Remplit le formulaire.
                            form.fields['j_id_7:spi'] = numeroFiscal;
                            form.fields['j_id_7:num_facture'] = referenceAvis;

                            // application/x-www-form-urlencoded
                            var parts = [];
                            for (var field in form.fields) {
                                parts.push(field + '=' + encodeURIComponent(form.fields[field]));
                            }
                            var data = parts.join('&');

                            // Poste le formulaire.
                            return page.open(form.action, 'post', data)
                                .then((status) => {
                                    if (status !== 'success') {
                                        throw 'Post error!';
                                    } else {
                                        return page.property('content');
                                    }
                                })
                                .then((body) => {
                                    // Décode les données de la page (utilise le code de svair-api).
                                    parseResponse(body, getYearFromReferenceAvis(referenceAvis), (err, result) => {
                                        if (err) {
                                            console.error(err);
                                            instance.exit();
                                            done(err, result);
                                        } else {
                                            // Succès !
                                            // TODO screenshot
                                            // page.render('test.png')
                                            //     .then(() => {
                                                    instance.exit();
                                                    done(err, result);
                                                // });
                                        }
                                    });
                                })
                                .catch((err) => {
                                    console.error(err);
                                    instance.exit();
                                    done(err);
                                });
                        });
                })
        })
}
