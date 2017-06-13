-- Up
CREATE TABLE avis (numeroFiscal INTEGER, referenceAvis INTEGER);
CREATE INDEX avis_index ON avis (numeroFiscal, referenceAvis);

-- Down
DROP TABLE avis;
