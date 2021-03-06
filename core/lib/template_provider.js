'use strict';

const fs = require('fs');
const path = require('path');

const ResourceCache = require('./resource_cache').ResourceCache;
const Template = require('./template').Template;
const FsSchemaProvider = require('./schema_provider').FsSchemaProvider;

function FsTemplateProvider(templateRootPath, filteredSets) {
    this.config_template_path = templateRootPath;
    this.schemaProviders = {};
    this.filteredSets = new Set(filteredSets || []);

    this.cache = new ResourceCache((templateName) => {
        const tsName = templateName.split('/')[0];
        if (!this.schemaProviders[tsName]) {
            this.schemaProviders[tsName] = new FsSchemaProvider(`${templateRootPath}/${tsName}`);
        }
        const schemaProvider = this.schemaProviders[tsName];
        let useMst = 0;
        let tmplpath = `${templateRootPath}/${templateName}`;
        if (fs.existsSync(`${tmplpath}.yml`)) {
            tmplpath = `${tmplpath}.yml`;
        } else if (fs.existsSync(`${tmplpath}.yaml`)) {
            tmplpath = `${tmplpath}.yaml`;
        } else if (fs.existsSync(`${tmplpath}.mst`)) {
            useMst = 1;
            tmplpath = `${tmplpath}.mst`;
        } else {
            return Promise.reject(new Error(`could not find a template with name "${templateName}"`));
        }

        return new Promise((resolve, reject) => {
            fs.readFile(tmplpath, (err, data) => {
                if (err) reject(err);
                else {
                    resolve(data.toString('utf8'));
                }
            });
        }).then(tmpldata => Template[(useMst) ? 'loadMst' : 'loadYaml'](tmpldata, schemaProvider));
    });

    return this;
}

FsTemplateProvider.prototype.fetch = function fetch(key) {
    return this.cache.fetch(key);
};

FsTemplateProvider.prototype.list = function list() {
    return new Promise((resolve, reject) => {
        fs.readdir(this.config_template_path, (err, files) => {
            if (err) return reject(err);
            return resolve(files.filter(x => (
                fs.lstatSync(path.join(this.config_template_path, x)).isDirectory()
                && (this.filteredSets.size === 0 || this.filteredSets.has(x))
            )));
        });
    }).then(sets => Promise.all(sets.map(setName => new Promise((resolve, reject) => {
        fs.readdir(path.join(this.config_template_path, setName), (err, files) => {
            if (err) return reject(err);
            return resolve(
                files
                    .filter(x => x.endsWith('.yml') || x.endsWith('.yaml') || x.endsWith('.mst'))
                    .map((x) => {
                        const tmplExt = x.split('.').pop();
                        let tmplName = '';
                        if (tmplExt === 'mst' || tmplExt === 'yml') {
                            tmplName = x.slice(0, -4);
                        } else if (tmplExt === 'yaml') {
                            tmplName = x.slice(0, -5);
                        }
                        return `${setName}/${tmplName}`;
                    })
            );
        });
    })))).then(sets => sets.reduce((acc, curr) => acc.concat(curr), []));
};

module.exports = {
    FsTemplateProvider
};
