/*
 * Copyright (c) 2016 VMware, Inc. All Rights Reserved.
 *
 * This product is licensed to you under the Apache License, Version 2.0 (the "License").
 * You may not use this product except in compliance with the License.
 *
 * This product may include a number of subcomponents with separate copyright notices
 * and license terms. Your use of these subcomponents is subject to the terms and
 * conditions of the subcomponent's license, as noted in the LICENSE file.
 */

import * as actions from 'actions/Actions';
import services from 'core/services';
import utils from 'core/utils';
import CrudStoreMixin from 'stores/mixins/CrudStoreMixin';
import ContextPanelStoreMixin from 'stores/mixins/ContextPanelStoreMixin';
import links from 'core/links';
import constants from 'core/constants';
import PlacementZonesStore from 'stores/PlacementZonesStore';

const OPERATION = {
  LIST: 'LIST',
  DETAILS: 'DETAILS'
};

let toViewModel = function(dto) {
  var customProperties = [];
  let hasCustomProperties = dto.customProperties && dto.customProperties !== null;
  if (hasCustomProperties) {
    for (var key in dto.customProperties) {
      if (dto.customProperties.hasOwnProperty(key)) {
        customProperties.push({
          name: key,
          value: dto.customProperties[key]
        });
      }
    }
  }

  var epzs = [];
  for (var i = 0; i < customProperties.length; i++) {
    if (customProperties[i].name.startsWith(constants.CUSTOM_PROPS.EPZ_NAME_PREFIX)) {
        let epzId = customProperties[i].name.slice(constants.CUSTOM_PROPS.EPZ_NAME_PREFIX.length);
        epzs.push({
           epzDocumentId: epzId,
           epzLink: links.PLACEMENT_ZONES + '/' + epzId
        });
    }
  }

  return {
    dto: dto,
    documentSelfLink: dto.documentSelfLink,
    selfLinkId: utils.getDocumentId(dto.documentSelfLink),
    id: dto.id,
    name: dto.name,
    powerState: dto.powerState,
    descriptionLink: dto.descriptionLink,
    resourcePoolLink: dto.resourcePoolLink,
    placementZoneDocumentId: dto.resourcePoolLink && utils.getDocumentId(dto.resourcePoolLink),
    epzs: epzs,
    connectionType: hasCustomProperties ? dto.customProperties.__adapterDockerType : null,
    customProperties: customProperties,
    computeType: hasCustomProperties ? dto.customProperties.__computeType : null
  };
};

let onOpenToolbarItem = function(name, data, shouldSelectAndComplete) {
  var contextViewData = {
    expanded: true,
    activeItem: {
      name: name,
      data: data
    },
    shouldSelectAndComplete: shouldSelectAndComplete
  };

  this.setInData(['editingItemData', 'contextView'], contextViewData);
  this.emitChange();
};

let isContextPanelActive = function(name) {
  var activeItem = this.data.editingItemData.contextView &&
      this.data.editingItemData.contextView.activeItem;
  return activeItem && activeItem.name === name;
};

let ComputeStore = Reflux.createStore({
  mixins: [ContextPanelStoreMixin, CrudStoreMixin],
  init() {
    PlacementZonesStore.listen((placementZonesData) => {
      if (!this.data.editingItemData) {
        return;
      }

      if (placementZonesData.items !== constants.LOADING) {
        this.setInData(['editingItemData', 'placementZones'], placementZonesData.items);
      }

      if (isContextPanelActive.call(this, constants.CONTEXT_PANEL.PLACEMENT_ZONES)) {
        this.setInData(['editingItemData', 'contextView', 'activeItem', 'data'],
          placementZonesData);

        var itemToSelect = placementZonesData.newItem || placementZonesData.updatedItem;
        if (itemToSelect && this.data.editingItemData.contextView.shouldSelectAndComplete) {
          clearTimeout(this.itemSelectTimeout);
          this.itemSelectTimeout = setTimeout(() => {
            this.setInData(['editingItemData', 'placementZone'], itemToSelect);
            this.onCloseToolbar();
          }, constants.VISUALS.ITEM_HIGHLIGHT_ACTIVE_TIMEOUT);
        }
      }
      this.emitChange();
    });
  },
  listenables: [actions.ComputeActions, actions.ComputeContextToolbarActions],
  onOpenCompute(queryOptions, forceReload) {
    var items = utils.getIn(this.data, ['listView', 'items']);
    if (!forceReload && items) {
      return;
    }

    this.setInData(['editingItemData'], null);
    this.setInData(['selectedItem'], null);
    this.setInData(['selectedItemDetails'], null);
    this.setInData(['listView', 'queryOptions'], queryOptions);

    var operation = this.requestCancellableOperation(OPERATION.LIST, queryOptions);

    if (operation) {
      this.cancelOperations(OPERATION.DETAILS);
      this.setInData(['listView', 'itemsLoading'], true);

      operation.forPromise(services.loadCompute(queryOptions)).then((result) => {
        var documents = result.documentLinks.map((documentLink) =>
              result.documents[documentLink]);
        var nextPageLink = result.nextPageLink;
        var itemsCount = result.totalCount;
        var compute = documents.map((document) => toViewModel(document));

        this.getPlacementZones(compute).then((result) => {
          compute.forEach((compute) => {
            compute.epzs.forEach((epz) => {
              if (result[epz.epzLink]) {
                epz.epzName = result[epz.epzLink].resourcePoolState.name;
              }
            });
          });
          return this.getDescriptions(compute);
        }).then((result) => {

          compute.forEach((compute) => {
            if (result[compute.descriptionLink]) {
              compute.cpuCount = result[compute.descriptionLink].cpuCount;
              compute.cpuMhzPerCore = result[compute.descriptionLink].cpuMhzPerCore;
              compute.memory =
                  Math.floor(result[compute.descriptionLink].totalMemoryBytes / 1048576);
            }
          });

          this.setInData(['listView', 'items'], compute);
          this.setInData(['listView', 'itemsLoading'], false);
          if (itemsCount !== undefined && itemsCount !== null) {
            this.setInData(['listView', 'itemsCount'], itemsCount);
          }
          this.setInData(['listView', 'nextPageLink'], nextPageLink);
          this.emitChange();
        });
      });
    }

    this.emitChange();
  },
  onOpenComputeNext(queryOptions, nextPageLink) {
    this.setInData(['listView', 'queryOptions'], queryOptions);

    var operation = this.requestCancellableOperation(OPERATION.LIST, queryOptions);

    if (operation) {
      this.cancelOperations(OPERATION.DETAILS);
      this.setInData(['listView', 'itemsLoading'], true);

      operation.forPromise(services.loadNextPage(nextPageLink)).then((result) => {

        var documents = result.documentLinks.map((documentLink) =>
              result.documents[documentLink]);
        var nextPageLink = result.nextPageLink;
        var compute = documents.map((document) => toViewModel(document));

        this.getPlacementZones(compute).then((result) => {
          compute.forEach((compute) => {
            compute.epzs.forEach((epz) => {
              if (result[epz.epzLink]) {
                epz.epzName = result[epz.epzLink].resourcePoolState.name;
              }
            });
          });
          return this.getDescriptions(compute);
        }).then((result) => {

          compute.forEach((compute) => {
            if (result[compute.descriptionLink]) {
              compute.cpuCount = result[compute.descriptionLink].cpuCount;
              compute.cpuMhzPerCore = result[compute.descriptionLink].cpuMhzPerCore;
              compute.memory =
                  Math.floor(result[compute.descriptionLink].totalMemoryBytes / 1048576);
            }
          });

          this.setInData(['listView', 'items'],
              utils.mergeDocuments(this.data.listView.items.asMutable(), compute));

          this.setInData(['listView', 'itemsLoading'], false);
          this.setInData(['listView', 'nextPageLink'], nextPageLink);
          this.emitChange();
        });
      });
    }

    this.emitChange();
  },
  onEditCompute(computeId) {
    services.loadHost(computeId).then((document) => {
      let model = toViewModel(document);
      actions.PlacementZonesActions.retrievePlacementZones();

      let promises = [];
      if (document.resourcePoolLink) {
        promises.push(
            services.loadPlacementZone(document.resourcePoolLink).catch(() => Promise.resolve()));
      } else {
        promises.push(Promise.resolve());
      }

      if (document.tagLinks && document.tagLinks.length) {
        promises.push(
            services.loadTags(document.tagLinks).catch(() => Promise.resolve()));
      } else {
        promises.push(Promise.resolve());
      }

      Promise.all(promises).then(([config, tags]) => {
        if (document.resourcePoolLink && config) {
          model.placementZone = config.resourcePoolState;
        }
        model.tags = tags ? Object.values(tags) : [];

        this.setInData(['editingItemData', 'item'], Immutable(model));
        this.emitChange();
      });

    }).catch(this.onGenericEditError);

    this.setInData(['editingItemData', 'item'], {});
    this.emitChange();
  },
  onUpdateCompute(model, tags) {
    let tagsPromises = [];
    tags.forEach((tag) => {
      tagsPromises.push(services.createTag(tag));
    });
    Promise.all(tagsPromises).then((updatedTags) => {
      let data = $.extend({}, model.dto, {
        resourcePoolLink: model.resourcePoolLink,
        tagLinks: [...new Set(updatedTags.map((tag) => tag.documentSelfLink))]
      });
      services.updateCompute(model.selfLinkId, data).then(() => {
        actions.NavigationActions.openCompute();
        this.setInData(['editingItemData'], null);
        this.emitChange();
      }).catch(this.onGenericEditError);
    });

    this.setInData(['editingItemData', 'item'], model);
    this.setInData(['editingItemData', 'validationErrors'], null);
    this.setInData(['editingItemData', 'saving'], true);
    this.emitChange();
  },
  onGenericEditError(e) {
    var validationErrors = utils.getValidationErrors(e);
    this.setInData(['editingItemData', 'validationErrors'], validationErrors);
    this.setInData(['editingItemData', 'saving'], false);
    console.error(e);
    this.emitChange();
  },
  onOpenToolbarPlacementZones() {
    onOpenToolbarItem.call(this, constants.CONTEXT_PANEL.PLACEMENT_ZONES,
      PlacementZonesStore.getData(), false);
  },
  onCloseToolbar() {
    if (!this.data.editingItemData) {
      this.closeToolbar();
    } else {
      var contextViewData = {
        expanded: false,
        activeItem: null
      };
      this.setInData(['editingItemData', 'contextView'], contextViewData);
      this.emitChange();
    }
  },
  onCreatePlacementZone() {
    onOpenToolbarItem.call(this, constants.CONTEXT_PANEL.PLACEMENT_ZONES,
      PlacementZonesStore.getData(), true);
    actions.PlacementZonesActions.editPlacementZone({});
  },
  onManagePlacementZones() {
    onOpenToolbarItem.call(this, constants.CONTEXT_PANEL.PLACEMENT_ZONES,
      PlacementZonesStore.getData(), true);
  },
  getPlacementZones(compute) {
    let placementZones = utils.getIn(this.data, ['listView', 'placementZones']) || [];
    let resourcePoolLinks = [];
    compute.forEach((compute) => {
      compute.epzs.forEach((epz) => resourcePoolLinks.push(epz.epzLink));
    });
    let links = [...new Set(resourcePoolLinks)].filter((link) =>
        !placementZones.hasOwnProperty(link));
    if (links.length === 0) {
      return Promise.resolve(placementZones);
    }
    return services.loadPlacementZones(links).then((newPlacementZones) => {
      this.setInData(['listView', 'placementZones'],
          $.extend({}, placementZones, newPlacementZones));
      return utils.getIn(this.data, ['listView', 'placementZones']);
    });
  },
  getDescriptions(compute) {
    let descriptions = utils.getIn(this.data, ['listView', 'descriptions']) || [];
    let descriptionLinks = compute.filter((compute) =>
        compute.descriptionLink).map((compute) => compute.descriptionLink);
    let links = [...new Set(descriptionLinks)].filter((link) =>
        !descriptions.hasOwnProperty(link));
    if (links.length === 0) {
      return Promise.resolve(descriptions);
    }
    return services.loadHostDescriptions(links).then((newDescriptions) => {
      this.setInData(['listView', 'descriptions'], $.extend({}, descriptions, newDescriptions));
      return utils.getIn(this.data, ['listView', 'descriptions']);
    });
  }
});

export default ComputeStore;
