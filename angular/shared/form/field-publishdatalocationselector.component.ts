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
import { Input, Component, OnInit, Inject, Injector} from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash-es";
import { RecordsService } from './records.service';
import * as Uppy from 'uppy';


/**
 * Contributor Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class PublishDataLocationSelectorField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  value: object[];
  accessDeniedObjects: object[];
  failedObjects: object[];
  recordsService: RecordsService;
  columns: object[];
  newLocation:any = {type:"url", location:"",notes:""};
  dataTypes:object[] = [{
    'label': 'URL',
    'value': 'url',
  },
  {
    'label': 'Physical location',
    'value': 'physical',
  },
  {
    'label': 'File path',
    'value': 'file',
  },
  {
    'label': 'Attachment',
    'value': 'attachment'
  }
];

  dataTypeLookup:any = {
    'url':"URL",
    'physical':"Physical location",
    'attachment':"Attachment",
    'file':"File path"
  }

  constructor(options: any, injector: any) {
    super(options, injector);
    this.accessDeniedObjects = [];

    this.columns = options['columns'] || [];


    this.value = options['value'] || this.setEmptyValue();
    this.recordsService = this.getFromInjector(RecordsService);
  }

  setValue(value:any, emitEvent:boolean = true) {
    this.formModel.setValue(value, {emitEvent: emitEvent, emitModelToViewChange:true });
    this.formModel.markAsTouched();
    this.formModel.markAsDirty();
  }

  setEmptyValue() {
    this.value = [];
    return this.value;
  }

  addLocation() {
    this.value.push(this.newLocation);
    this.setValue(this.value);
    this.newLocation = {type:"url", location:"",notes:""};
  }

  appendLocation(newLoc:any) {
    this.value.push(newLoc);
    this.setValue(this.value, true);
  }

  clearPendingAtt(value) {
    _.each(value, (val:any) => {
      if (val.type == 'attachment') {
       _.unset(val, 'pending');
      }
    });
  }

  public populateDataLocation(oid, config: any) {
      console.log(oid);
      this.recordsService.getRecordMeta(oid).then(record => {
        this.value = record.dataLocations;
      });
 }

  removeLocation(loc: any) {
    _.remove(this.value, (val:any) => {
      return val.type == loc.type && val.name == loc.name && val.location == loc.location;
    });
    this.setValue(this.value);
  }

}
/**
* Component to display information from related objects within ReDBox
*
*
*
*
*/
@Component({
  selector: 'publish-data-location-selector',
  templateUrl: './field-publishdatalocationselector.html'
})
export class PublishDataLocationSelectorComponent extends SimpleComponent {
  field: PublishDataLocationSelectorField;

  public ngOnInit() {

  }

  public locationSelected(location){
    _.each(this.field.value, dataLocation => {
      if(dataLocation['location'] == location) {
        if(dataLocation['selected']) {
          dataLocation['selected'] = false;
        } else {
          dataLocation['selected'] = true;
        }
      }
    });
  }

  public getDatalocations() {
    return this.field.value;
  }

  public getAbsUrl(location:string) {
    return `${this.field.recordsService.getBrandingAndPortalUrl}/record/${location}`
  }
}