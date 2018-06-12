// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;
import { Observable } from 'rxjs/Rx';
import moment from 'moment-es6';
import * as tus from 'tus-node-server';
import * as fs from 'fs';

declare var FormsService, RecordsService, WorkflowStepsService, BrandingService, RecordTypesService, TranslationService, User, EmailService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../core/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to a Record, includings Forms, etc.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Record extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'edit',
      'getForm',
      'create',
      'update',
      'stepTo',
      'modifyEditors',
      'search',
      'getType',
      'getWorkflowSteps',
      'getMeta',
      'getTransferResponsibilityConfig',
      'updateResponsibilities',
      'doAttachment',
      'getAttachments',
      'getDataStream',
      'getAllTypes'

    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {
    }

    public getMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid') ? req.param('oid') : '';
      var obs = RecordsService.getMeta(oid);
      return obs.subscribe(record => {
        this.hasViewAccess(brand, req.user, record).subscribe(hasViewAccess => {
          if (hasViewAccess) {
            return res.json(record.metadata);
          } else {
            return res.json({ status: "Access Denied" });
          }

        });
      });
    }

    public edit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid') ? req.param('oid') : '';
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      const rdmp = req.query.rdmp ? req.query.rdmp : '';
      let appSelector = 'dmp-form';
      let appName = 'dmp';
      sails.log.debug('RECORD::APP: ' + appName)
      if (recordType != '') {
        FormsService.getForm(brand.id, recordType, true).subscribe(form => {
          if (form['customAngularApp'] != null) {
            appSelector = form['customAngularApp']['appSelector'];
            appName = form['customAngularApp']['appName'];
          }
          return this.sendView(req, res, 'record/edit', { oid: oid, rdmp: rdmp, recordType: recordType, appSelector: appSelector, appName: appName });
        });
      } else {
        RecordsService.getMeta(oid).flatMap(record => {
          const formName = record.metaMetadata.form;
          return FormsService.getFormByName(formName, true);
        }).subscribe(form => {
          sails.log.debug(form);
          if (form['customAngularApp'] != null) {
            appSelector = form['customAngularApp']['appSelector'];
            appName = form['customAngularApp']['appName'];
          }
          return this.sendView(req, res, 'record/edit', { oid: oid, rdmp: rdmp, recordType: recordType, appSelector: appSelector, appName: appName });
        });

      }
    }

    protected hasEditAccess(brand, user, currentRec) {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      return Observable.of(RecordsService.hasEditAccess(brand, user, user.roles, currentRec));
    }

    protected hasViewAccess(brand, user, currentRec) {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      return Observable.of(RecordsService.hasViewAccess(brand, user, user.roles, currentRec));
    }

    public getTransferResponsibilityConfig(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var type = req.param('type');
      var recordTypeConfig = sails.config.recordtype;

      return res.json(this.getTransferResponsibilityConfigObject(recordTypeConfig, type))
    }



    private getTransferResponsibilityConfigObject(config, type) {
      for (var key in config) {
        if (config[key]["packageType"] == type) {
          return config[key]["transferResponsibility"];
        }
      }
      return {};
    }

    public updateResponsibilities(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const records = req.body.records;
      var role = req.body.role;
      var toEmail = req.body.email;
      var toName = req.body.name;
      sails.log.debug("In update responsibilities");
      sails.log.debug(req);
      let recordCtr = 0;
      if (records.length > 0) {
        _.forEach(records, rec => {
          const oid = rec.oid;
          this.getRecord(oid).subscribe(record => {
            //TODO: hardcoded to RDMP for the time being
            var transferConfig = this.getTransferResponsibilityConfigObject(sails.config.recordtype, 'rdmp');

            var nameField = transferConfig.fields[role].fieldNames.name;
            var emailField = transferConfig.fields[role].fieldNames.email;


            _.set(record, "metadata." + nameField, toName);
            _.set(record, "metadata." + emailField, toEmail);

            if (role == "chiefInvestigator") {
              nameField = transferConfig.fields["dataOwner"].fieldNames.name;
              emailField = transferConfig.fields["dataOwner"].fieldNames.email;
              _.set(record, "metadata." + nameField, toName);
              _.set(record, "metadata." + emailField, toEmail);
            }

            if (role == "dataManager") {
              _.set(record, "metadata.dataLicensingAccess_manager", toName);
            }

            RecordsService.updateMeta(brand, oid, record).subscribe(response => {
              if (response && response.code == "200") {
                recordCtr++;

                var to = toEmail;
                var subject = "Ownership transfered";
                var data = {};
                data['record'] = record;
                data['name'] = toName;
                data['oid'] = toName;
                EmailService.sendTemplate(to, subject, "transferOwnerTo", data);
                if (recordCtr == records.length) {
                  response.success = true;
                  this.ajaxOk(req, res, null, response);
                }
              } else {
                sails.log.error(`Failed to update authorization:`);
                sails.log.error(response);
                this.ajaxFail(req, res, TranslationService.t('auth-update-error'));
              }
            }, error => {
              sails.log.error("Error updating auth:");
              sails.log.error(error);
              this.ajaxFail(req, res, error.message);
            });

          });
        });
      } else {
        this.ajaxFail(req, res, 'No records specified');
      }
    }


    public getForm(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const name = req.param('name');
      const oid = req.param('oid');
      const editMode = req.query.edit == "true";

      let obs = null;
      if (_.isEmpty(oid)) {
        obs = FormsService.getForm(brand.id, name, editMode).flatMap(form => {
          this.mergeFields(req, res, form.fields, {});
          return Observable.of(form);
        });
      } else {
        // defaults to retrive the form of the current workflow state...
        obs = RecordsService.getMeta(oid).flatMap(currentRec => {
          if (_.isEmpty(currentRec)) {
            return Observable.throw(new Error(`Error, empty metadata for OID: ${oid}`));
          }
          if (editMode) {
            return this.hasEditAccess(brand, req.user, currentRec)
              .flatMap(hasEditAccess => {
                if (!hasEditAccess) {
                  return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
                }
                const formName = currentRec.metaMetadata.form;
                return FormsService.getFormByName(formName, editMode).flatMap(form => {
                  if (_.isEmpty(form)) {
                    return Observable.throw(new Error(`Error, getting form ${formName} for OID: ${oid}`));
                  }
                  this.mergeFields(req, res, form.fields, currentRec.metadata);
                  return Observable.of(form);
                });
              });
          } else {
            return this.hasViewAccess(brand, req.user, currentRec)
              .flatMap(hasViewAccess => {
                if (!hasViewAccess) {
                  return Observable.throw(new Error(TranslationService.t('view-error-no-permissions')));
                }
                const formName = currentRec.metaMetadata.form;
                return FormsService.getFormByName(formName, editMode).flatMap(form => {
                  if (_.isEmpty(form)) {
                    return Observable.throw(new Error(`Error, getting form ${formName} for OID: ${oid}`));
                  }
                  this.mergeFields(req, res, form.fields, currentRec.metadata);
                  return Observable.of(form);
                });
              });
          }
        });
      }
      obs.subscribe(form => {
        if (!_.isEmpty(form)) {
          this.ajaxOk(req, res, null, form);
        } else {
          this.ajaxFail(req, res, null, { message: `Failed to get form with name:${name}` });
        }
      }, error => {
        sails.log.error("Error getting form definition:");
        sails.log.error(error);
        let message = error.message;
        if (error.error && error.error.code == 500) {
          message = TranslationService.t('missing-record');
        }
        this.ajaxFail(req, res, message);
      });

    }

    public create(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      let record = { metaMetadata: {} };
      var recordType = req.param('recordType');
      record.authorization = { view: [req.user.username], edit: [req.user.username] };
      record.metaMetadata.brandId = brand.id;
      record.metaMetadata.createdBy = req.user.username;
      //TODO: This is currently hardcoded
      record.metaMetadata.type = recordType;
      record.metadata = metadata;

      RecordTypesService.get(brand, recordType).subscribe(recordType => {
        let packageType = recordType.packageType;

        WorkflowStepsService.getFirst(recordType)
          .subscribe(wfStep => {
            let preSaveCreateHooks = _.get(recordType, "hooks.onCreate.pre", null);
            if (_.isArray(preSaveCreateHooks)) {
              let observable = null;
              _.each(preSaveCreateHooks, preSaveCreateHook => {
                let preSaveCreateHookFunctionString = _.get(preSaveCreateHook, "function", null);
                if (preSaveCreateHookFunctionString != null) {
                  let preSaveCreateHookFunction = eval(preSaveCreateHookFunctionString);
                  let options = _.get(preSaveCreateHook, "options", {});
                  if (observable == null) {
                    observable = preSaveCreateHookFunction(record, options);
                  } else {
                    observable = observable.flatMap(record => {
                      return preSaveCreateHookFunction(record, options);
                    });
                  }
                }
              });
              return observable.subscribe(obs => {

                return obs.subscribe(record => { return this.createRecord(record, wfStep, brand, packageType, recordType, req, res) });
              });
            } else {
              return this.createRecord(record, wfStep, brand, packageType, recordType, req, res);
            }
          }, error => {
            this.ajaxFail(req, res, `Failed to save record: ${error}`);
          });
      });
    }

    private createRecord(record, wfStep, brand, packageType, recordType, req, res) {
      this.updateWorkflowStep(record, wfStep);
      RecordsService.create(brand, record, packageType).subscribe(response => {
        if (response && response.code == "200") {
          response.success = true;
          this.triggerPostSaveTriggers(response['oid'], record, recordType, 'onCreate');
          this.ajaxOk(req, res, null, response);
        } else {
          this.ajaxFail(req, res, null, response);
        }
      }, error => {
        return Observable.throw(`Failed to save record: ${error}`)
      });
    }

    private triggerPostSaveTriggers(oid:string ,record:any, recordType:any, mode:string = 'onUpdate') {
      sails.log.debug("Triggering post save triggers ");
      sails.log.debug(`hooks.${mode}.post`);
      sails.log.debug(recordType);
      let postSaveCreateHooks = _.get(recordType, `hooks.${mode}.post`, null);
      if (_.isArray(postSaveCreateHooks)) {
        _.each(postSaveCreateHooks, postSaveCreateHook => {
          sails.log.debug(postSaveCreateHook);
          let postSaveCreateHookFunctionString = _.get(postSaveCreateHook, "function", null);
          if (postSaveCreateHookFunctionString != null) {
            let postSaveCreateHookFunction = eval(postSaveCreateHookFunctionString);
            let options = _.get(postSaveCreateHook, "options", {});
            postSaveCreateHookFunction(oid, record, options).subscribe(result => {
              sails.log.debug(`post-save trigger ${postSaveCreateHookFunctionString} completed for ${oid}`)
            });
          }
        });
      }
    }

    public update(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const oid = req.param('oid');
      const user = req.user;
      let currentRec = null;
      let origRecord = null;
      const failedAttachments = [];
      let recType = null;
      this.getRecord(oid).flatMap(cr => {
        currentRec = cr;
        return this.hasEditAccess(brand, user, currentRec);
      })
        .map(hasEditAccess => {
          return RecordTypesService.get(brand, currentRec.metaMetadata.type)
        }).flatMap(recordType => {
          return recordType
        }).flatMap(recordType => {
          recType = recordType;
          origRecord = _.cloneDeep(currentRec);
          currentRec.metadata = metadata;
          sails.log.debug("recordType");
          sails.log.debug(recordType);
          let preSaveUpdateHooks = _.get(recordType, "hooks.onUpdate.pre", null);
          sails.log.debug("preSaveUpdateHooks");
          sails.log.debug(preSaveUpdateHooks);
          let observable = Observable.of(currentRec);
          if (_.isArray(preSaveUpdateHooks)) {

            _.each(preSaveUpdateHooks, preSaveUpdateHook => {
              let preSaveUpdateHookFunctionString = _.get(preSaveUpdateHook, "function", null);
              if (preSaveUpdateHookFunctionString != null) {
                let preSaveUpdateHookFunction = eval(preSaveUpdateHookFunctionString);
                let options = _.get(preSaveUpdateHook, "options", {});

                observable = observable.flatMap(record => {
                  return preSaveUpdateHookFunction(record, options);
                });

              }
            });
          }
          return observable.map(record => {
            return record
          });

        }).subscribe(record => {
          if(record.metadata) {
            record = Observable.of(record);
          }
          record.subscribe(currentRec => {

            return FormsService.getFormByName(currentRec.metaMetadata.form, true)
              .flatMap(form => {
                currentRec.metaMetadata.attachmentFields = form.attachmentFields;
                return this.updateMetadata(brand, oid, currentRec, user.username);
              })
              .subscribe(response => {
                if (response && response.code == "200") {
                  this.triggerPostSaveTriggers(response['oid'], record, recType);
                  return this.updateDataStream(oid, origRecord, metadata, response, req, res);
                } else {
                  this.ajaxFail(req, res, null, response);
                }
              }, error => {
                sails.log.error("Error updating meta:");
                sails.log.error(error);
                this.ajaxFail(req, res, error.message);
              });
          });
        });
    }

    /**
     * Handles data stream updates, atm, this call is terminal.
     */
    protected updateDataStream(oid, origRecord, metadata, response, req, res) {
      const fileIdsAdded = [];
      RecordsService.updateDatastream(oid, origRecord, metadata, sails.config.record.attachments.stageDir, fileIdsAdded)
        .concatMap(reqs => {
          if (reqs) {
            sails.log.verbose(`Updating data streams...`);
            return Observable.from(reqs);
          } else {
            sails.log.verbose(`No datastreams to update...`);
            return Observable.of(null);
          }
        })
        .concatMap((promise) => {
          if (promise) {
            sails.log.verbose(`Update datastream request is...`);
            sails.log.verbose(JSON.stringify(promise));
            return promise.catch(e => {
              sails.log.verbose(`Error in updating stream::::`);
              sails.log.verbose(JSON.stringify(e));
              return Observable.of(e);
            });
          } else {
            return Observable.of(null);
          }
        })
        .concatMap(updateResp => {
          if (updateResp) {
            sails.log.verbose(`Got response from update datastream request...`);
            sails.log.verbose(JSON.stringify(updateResp));
          }
          return Observable.of(updateResp);
        })
        .last()
        .subscribe(whatever => {
          sails.log.verbose(`Done with updating streams and returning response...`);
          response.success = true;
          this.ajaxOk(req, res, null, response);
        }, error => {
          sails.log.error("Error updating datatreams:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
    }

    protected saveMetadata(brand, oid, currentRec, metadata, user): Observable<any> {
      currentRec.metadata = metadata;
      return this.updateMetadata(brand, oid, currentRec, user.username);
    }

    protected saveAuthorization(brand, oid, currentRec, authorization, user): Observable<any> {
      return this.hasEditAccess(brand, user, currentRec)
        .flatMap(hasEditAccess => {
          currentRec.authorization = authorization;
          return this.updateAuthorization(brand, oid, currentRec, user.username);
        });
    }

    protected updateWorkflowStep(currentRec, nextStep) {
      if (!_.isEmpty(nextStep)) {
        currentRec.workflow = nextStep.config.workflow;
        // TODO: validate data with form fields
        currentRec.metaMetadata.form = nextStep.config.form;
        // Check for JSON-LD config
        if (sails.config.jsonld.addJsonLdContext) {
          currentRec.metadata['@context'] = sails.config.jsonld.contexts[currentRec.metaMetadata.form];
        }
        // update authorizations based on workflow...
        currentRec.authorization.viewRoles = nextStep.config.authorization.viewRoles;
        currentRec.authorization.editRoles = nextStep.config.authorization.editRoles;
      }
    }

    protected getRecord(oid) {
      return RecordsService.getMeta(oid).flatMap(currentRec => {
        if (_.isEmpty(currentRec)) {
          return Observable.throw(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
        }
        return Observable.of(currentRec);
      });
    }

    protected updateMetadata(brand, oid, currentRec, username) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return Observable.throw(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      currentRec.metaMetadata.lastSavedBy = username;
      currentRec.metaMetadata.lastSaveDate = moment().format();
      sails.log.verbose(`Calling record service...`);
      sails.log.verbose(currentRec);
      return RecordsService.updateMeta(brand, oid, currentRec);
    }

    protected updateAuthorization(brand, oid, currentRec, username) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return Observable.throw(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      return RecordsService.updateMeta(brand, oid, currentRec);
    }

    public stepTo(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');
      let origRecord = null;
      return this.getRecord(oid).flatMap(currentRec => {
        origRecord = _.cloneDeep(currentRec);
        return this.hasEditAccess(brand, req.user, currentRec)
          .flatMap(hasEditAccess => {
            if (!hasEditAccess) {
              return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
            }
            return WorkflowStepsService.get(brand, targetStep)
              .flatMap(nextStep => {
                currentRec.metadata = metadata;
                sails.log.verbose("Current rec:");
                sails.log.verbose(currentRec);
                sails.log.verbose("Next step:");
                sails.log.verbose(nextStep);
                this.updateWorkflowStep(currentRec, nextStep);
                return this.updateMetadata(brand, oid, currentRec, req.user.username);
              });
          });
      })
        .subscribe(response => {
          if (response && response.code == "200") {
            response.success = true;
            this.ajaxOk(req, res, null, response);
            return this.updateDataStream(oid, origRecord, metadata, response, req, res);
          } else {
            this.ajaxFail(req, res, null, response);
          }
        }, error => {
          sails.log.error("Error updating meta:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
    }

    protected mergeFields(req, res, fields, metadata) {
      _.forEach(fields, field => {
        if (_.has(metadata, field.definition.name)) {
          field.definition.value = metadata[field.definition.name];
        }
        this.replaceCustomFields(req, res, field, metadata);
        const val = field.definition.value;
        if (field.definition.fields && _.isObject(val) && !_.isString(val) && !_.isUndefined(val) && !_.isNull(val) && !_.isEmpty(val)) {
          _.each(field.definition.fields, fld => {
            fld.definition.value = _.get(metadata, `${field.definition.name}.${fld.definition.name}`);
          });
        } else
          if (field.definition.fields) {
            this.mergeFields(req, res, field.definition.fields, metadata);
          }
      });
    }

    protected replaceCustomFields(req, res, field, metadata) {
      let variableSubstitutionFields = field.variableSubstitutionFields;
      if (!_.isEmpty(variableSubstitutionFields)) {
        _.forEach(variableSubstitutionFields, fieldName => {
          _.forOwn(sails.config.record.customFields, (customConfig, customKey) => {
            const fieldTarget = _.get(field.definition, fieldName);
            if (!_.isEmpty(fieldTarget) && _.isString(fieldTarget) && fieldTarget.indexOf(customKey) != -1) {
              let replacement = null;
              if (customConfig.source == 'request') {
                switch (customConfig.type) {
                  case 'session':
                    replacement = req.session[customConfig.field];
                    break;
                  case 'param':
                    replacement = req.param(customConfig.field);
                    break;
                  case 'user':
                    replacement = req.user[customConfig.field];
                    break;
                }
              }

              if (!_.isEmpty(replacement)) {
                _.set(field.definition, fieldName, fieldTarget.replace(customKey, replacement));
              }
            }
          });
        });
      }
    }

    public modifyEditors(req, res) {
      const records = req.body.records;
      var toUsername = req.body.username;
      var toEmail = req.body.email;
      //TODO: Add email to username lookup
      const fromUsername = req.user.username;
      const brand = BrandingService.getBrand(req.session.branding);
      const user = req.user;

      let recordCtr = 0;
      if (records.length > 0) {
        _.forEach(records, rec => {
          const oid = rec.oid;
          this.getRecord(oid).subscribe(record => {
            const authorization = _.cloneDeep(record.authorization);
            // current user will lose edit access but will keep read-only access
            _.remove(authorization.edit, (username) => {
              return username == fromUsername;
            });
            if (_.isUndefined(_.find(authorization.view, (username) => { return username == fromUsername }))) {
              authorization.view.push(fromUsername);
            }
            if (!_.isEmpty(toUsername)) {
              if (_.isUndefined(_.find(authorization.edit, (username) => { return username == toUsername }))) {
                authorization.edit.push(toUsername);
              }
            } else {
              if (_.isUndefined(_.find(authorization.editPending, (email) => { return toEmail == email }))) {
                if (_.isUndefined(authorization.editPending)) {
                  authorization.editPending = [];
                }
                authorization.editPending.push(toEmail);
              }
            }

            this.saveAuthorization(brand, oid, record, authorization, user).subscribe(response => {
              if (response && response.code == "200") {
                recordCtr++;
                if (recordCtr == records.length) {
                  response.success = true;
                  this.ajaxOk(req, res, null, response);
                }
              } else {
                sails.log.error(`Failed to update authorization:`);
                sails.log.error(response);
                this.ajaxFail(req, res, TranslationService.t('auth-update-error'));
              }
            }, error => {
              sails.log.error("Error updating auth:");
              sails.log.error(error);
              this.ajaxFail(req, res, error.message);
            });
          });
        });
      } else {
        this.ajaxFail(req, res, 'No records specified');
      }
    }

    public search(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const type = req.param('type');
      const workflow = req.query.workflow;
      const searchString = req.query.searchStr;
      const exactSearchNames = _.isEmpty(req.query.exactNames) ? [] : req.query.exactNames.split(',');
      const exactSearches = [];
      const facetSearchNames = _.isEmpty(req.query.facetNames) ? [] : req.query.facetNames.split(',');
      const facetSearches = [];

      _.forEach(exactSearchNames, (exactSearch) => {
        exactSearches.push({ name: exactSearch, value: req.query[`exact_${exactSearch}`] });
      });
      _.forEach(facetSearchNames, (facetSearch) => {
        facetSearches.push({ name: facetSearch, value: req.query[`facet_${facetSearch}`] });
      });


      RecordsService.searchFuzzy(type, workflow, searchString, exactSearches, facetSearches, brand, req.user, req.user.roles, sails.config.record.search.returnFields)
        .subscribe(searchRes => {
          this.ajaxOk(req, res, null, searchRes);
        }, error => {
          this.ajaxFail(req, res, error.message);
        });
    }
    /** Returns the RecordType configuration */
    public getType(req, res) {
      const recordType = req.param('recordType');
      const brand = BrandingService.getBrand(req.session.branding);
      RecordTypesService.get(brand, recordType).subscribe(recordType => {
        this.ajaxOk(req, res, null, recordType);
      }, error => {
        this.ajaxFail(req, res, error.message);
      });
    }

    /** Returns all RecordTypes configuration */
    public getAllTypes(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      RecordTypesService.getAll(brand).subscribe(recordTypes => {
        this.ajaxOk(req, res, null, recordTypes);
      }, error => {
        this.ajaxFail(req, res, error.message);
      });
    }

    protected tusServer: any;

    protected initTusServer() {
      if (!this.tusServer) {
        this.tusServer = new tus.Server();
        const targetDir = sails.config.record.attachments.stageDir;
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir);
        }
        // path below is appended to the 'Location' header, so it must match the routes for this controller if you want to keep your sanity
        this.tusServer.datastore = new tus.FileStore({
          path: sails.config.record.attachments.path,
          directory: targetDir
        });
        this.tusServer.on(tus.EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
          sails.log.verbose(`::: File uploaded to staging:`);
          sails.log.verbose(JSON.stringify(event));
        });
        this.tusServer.on(tus.EVENTS.EVENT_FILE_CREATED, (event) => {
          sails.log.verbose(`::: File created:`);
          sails.log.verbose(JSON.stringify(event));
        });
      }
    }

    protected getTusMetadata(req, field: string): string {
      const entries = {};
      _.each(req.headers['upload-metadata'].split(','), (entry) => {
        const elems = entry.split(' ');
        entries[elems[0]] = elems[1];
      });
      return Buffer.from(entries[field], 'base64').toString('ascii');
    }

    public doAttachment(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const attachId = req.param('attachId');
      this.initTusServer();
      const method = _.toLower(req.method);
      if (method == 'post') {
        req.baseUrl = `${sails.config.appPort ? `:${sails.config.appPort}`: ''}/${req.session.branding}/${req.session.portal}/record/${oid}`
      } else {
        req.baseUrl = '';
      }
      return this.getRecord(oid).flatMap(currentRec => {
        return this.hasEditAccess(brand, req.user, currentRec).flatMap(hasEditAccess => {
            if(!hasEditAccess) {
              return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
            }
            if (method == 'get') {
              // check if this attachId exists in the record
              let found = null;
              _.each(currentRec.metaMetadata.attachmentFields, (attField) => {
                if (!found) {
                  const attFieldVal = currentRec.metadata[attField];
                  found = _.find(attFieldVal, (attVal) => {
                    return attVal.fileId == attachId
                  });
                  if (found) {
                    return false;
                  }
                }
              });
              if (!found) {
                return Observable.throw(new Error(TranslationService.t('attachment-not-found')))
              }
              res.set('Content-Type', found.mimeType);
              res.set('Content-Disposition', `attachment; filename="${found.name}"`);
              sails.log.verbose(`Returning datastream observable of ${oid}: ${found.name}, attachId: ${attachId}`);
              return RecordsService.getDatastream(oid, attachId).flatMap((response) => {
                res.end(Buffer.from(response.body), 'binary');
                return Observable.of(oid);
              });
            } else {
              // process the upload...
              this.tusServer.handle(req, res);
              return Observable.of(oid);
            }
          });
      })
      .subscribe(whatever => {
        // ignore...
      }, error => {
        if (this.isAjax(req)) {
          this.ajaxFail(req, res, error.message);
        } else {
          if (error.message == TranslationService.t('edit-error-no-permissions')) {
            res.forbidden();
          } else if (error.message == TranslationService.t('attachment-not-found')) {
            res.notFound();
          }
        }
      });
    }

    public getWorkflowSteps(req, res) {
      const recordType = req.param('recordType');
      const brand = BrandingService.getBrand(req.session.branding);
      return RecordTypesService.get(brand, recordType).subscribe(recordType => {
        return WorkflowStepsService.getAllForRecordType(recordType).subscribe(wfSteps => {
          return this.ajaxOk(req, res, null, wfSteps);
        });
      });
    }

    public getAttachments(req, res) {
      const oid = req.param('oid');
      return RecordsService.listDatastreams(oid).subscribe(datastreams => {
        let attachments = [];

        _.each(datastreams['datastreams'], datastream => {
          let attachment = {};
          attachment['dateUpdated'] = moment(datastream['lastModified']['$date']).format();
          attachment['label'] = datastream['label'];
          attachment['contentType'] = datastream['contentType'];
          attachments.push(attachment);
        });
          return this.ajaxOk(req, res, null, attachments);
      });
    }

    public getDataStream(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');

      return this.getRecord(oid).flatMap(currentRec => {
        return this.hasEditAccess(brand, req.user, currentRec).flatMap(hasEditAccess => {
          if(!hasEditAccess) {
            return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
          } else {
            const fileName = req.param('fileName')? req.param('fileName') : datastreamId;
            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Disposition', `attachment; filename="${fileName}"`);
            sails.log.verbose(`Returning datastream observable of ${oid}: ${fileName}, datastreamId: ${datastreamId}`);
            return RecordsService.getDatastream(oid, datastreamId).flatMap((response) => {
              res.end(Buffer.from(response.body), 'binary');
              return Observable.of(oid);
            });
          }
        }) }).subscribe(whatever => {
          // ignore...
        }, error => {
          if (this.isAjax(req)) {
            this.ajaxFail(req, res, error.message);
          } else {
            if (error.message == TranslationService.t('edit-error-no-permissions')) {
              res.forbidden();
            } else if (error.message == TranslationService.t('attachment-not-found')) {
              res.notFound();
            }
          }
        });
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Record().exports();