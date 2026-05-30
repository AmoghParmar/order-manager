import { defineStore } from "pinia";
import { api, commonUtil } from "@common";
import logger from "@/logger";

const sortFields = (fields: any[]) => fields.sort((a: any, b: any) => a.fieldName.localeCompare(b.fieldName));
const carrierLabel = (carrier: any) => [carrier.firstName, carrier.lastName].filter(Boolean).join(" ") || carrier.groupName || carrier.partyId;
const shipmentMethodLabel = (method: any) => method?.description || method?.shipmentMethodTypeId || "";

export const useUtilStore = defineStore("util", {
  state: () => ({
    statusItems: {} as Record<string, any[]>,
    enums: {} as Record<string, any[]>,
    carriers: [] as any[],
    shipmentMethodTypes: [] as any[],
    productStoreShipmentMethods: {} as Record<string, any[]>,
    statusFlowTransitions: {} as Record<string, any[]>,
    entities: [] as string[],
    entityFields: {} as Record<string, any[]>,
    fetchStatus: {
      statusItems: "none",
      enums: "none",
      carriers: "none",
      shipmentMethodTypes: "none",
      productStoreShipmentMethods: "none",
      statusFlowTransitions: "none",
      entities: "none",
      entityFields: "none"
    } as any
  }),
  getters: {
    getStatusItemsByType: (state) => (typeId: string) => state.statusItems[typeId] || [],
    getEnumsByType: (state) => (typeId: string) => state.enums[typeId] || [],
    getCarriers: (state) => state.carriers,
    getShipmentMethodTypes: (state) => state.shipmentMethodTypes,
    getProductStoreShipmentMethods: (state) => (productStoreId: string) => state.productStoreShipmentMethods[productStoreId] || [],
    getCarrierOptions: (state) => state.carriers.map((carrier: any) => ({
      id: carrier.partyId,
      label: carrierLabel(carrier)
    })),
    getShipmentMethodOptions: (state) => state.shipmentMethodTypes.map((method: any) => ({
      id: method.shipmentMethodTypeId,
      label: shipmentMethodLabel(method)
    })),
    getProductStoreShipmentMethodOptions: (state) => (productStoreId: string) => (state.productStoreShipmentMethods[productStoreId] || []).map((method: any) => ({
      id: method.shipmentMethodTypeId,
      label: method.description || shipmentMethodLabel(state.shipmentMethodTypes.find((type: any) => type.shipmentMethodTypeId === method.shipmentMethodTypeId)) || method.shipmentMethodTypeId,
      carrierPartyId: method.partyId || method.carrierPartyId
    })),
    getStatusItemDesc: (state) => (statusId: string) => {
      const statusItem = Object.values(state.statusItems).flatMap((items) => items).find((item: any) => item.statusId === statusId) as any;
      return statusItem?.description || statusId;
    },
    getAllowedTransitions: (state) => (statusId: string) => {
      const transitions = state.statusFlowTransitions[statusId] || [];
      return transitions.map((transition: any) => ({
        ...transition,
        toStatusDescription: state.getStatusItemDesc(transition.toStatusId || ""),
        toStatusColor: commonUtil.getStatusColor(state.getStatusItemDesc(transition.toStatusId || ""))
      }));
    },
    getEntities: (state) => state.entities,
    getEntityFields: (state) => (entityName: string) => state.entityFields[entityName] || [],
    getFetchStatus: (state) => state.fetchStatus
  },
  actions: {
    async fetchStatusItemsByType(typeId: string) {
      if (this.getStatusItemsByType(typeId).length) return;

      this.fetchStatus.statusItems = "pending";
      try {
        const resp = await api({
          url: "admin/status",
          method: "GET",
          params: {
            statusTypeId: typeId,
            pageSize: 200
          }
        });
        this.statusItems[typeId] = resp.data;
        this.fetchStatus.statusItems = "success";
      } catch (error: any) {
        logger.error(`Failed to fetch status item data for type ${typeId}`, error);
        this.fetchStatus.statusItems = "error";
      }
    },
    async fetchEnumsByType(typeId: string) {
      if (this.getEnumsByType(typeId).length) return;

      this.fetchStatus.enums = "pending";
      try {
        const resp = await api({
          url: "admin/enums",
          method: "GET",
          params: {
            enumTypeId: typeId,
            pageSize: 200,
            orderByField: "sequenceNum"
          }
        });
        this.enums[typeId] = resp.data;
        this.fetchStatus.enums = "success";
      } catch (error: any) {
        logger.error(`Failed to fetch enum data for type ${typeId}`, error);
        this.fetchStatus.enums = "error";
      }
    },
    async fetchCarriers() {
      if (this.carriers.length) return;

      this.fetchStatus.carriers = "pending";
      try {
        const resp = await api({
          url: "oms/shippingGateways/carrierParties",
          method: "GET",
          params: {
            roleTypeId: "CARRIER",
            fieldsToSelect: ["partyId", "partyTypeId", "roleTypeId", "firstName", "lastName", "groupName"],
            distinct: "Y",
            pageSize: 250,
            orderByField: "groupName"
          }
        });
        this.carriers = resp.data || [];
        this.fetchStatus.carriers = "success";
      } catch (error: any) {
        logger.error("Failed to fetch carrier data", error);
        this.fetchStatus.carriers = "error";
      }
    },
    async fetchShipmentMethodTypes() {
      if (this.shipmentMethodTypes.length) return;

      this.fetchStatus.shipmentMethodTypes = "pending";
      try {
        const resp = await api({
          url: "oms/shippingGateways/shipmentMethodTypes",
          method: "GET",
          params: {
            pageSize: 250,
            orderByField: "description"
          }
        });
        this.shipmentMethodTypes = resp.data || [];
        this.fetchStatus.shipmentMethodTypes = "success";
      } catch (error: any) {
        logger.error("Failed to fetch shipment method type data", error);
        this.fetchStatus.shipmentMethodTypes = "error";
      }
    },
    async fetchProductStoreShipmentMethods(productStoreId: string) {
      if (!productStoreId || productStoreId === "All") return;
      if (this.productStoreShipmentMethods[productStoreId]?.length) return;

      this.fetchStatus.productStoreShipmentMethods = "pending";
      try {
        const resp = await api({
          url: "oms/dataDocumentView",
          method: "POST",
          data: {
            dataDocumentId: "ProductStoreShipmentMethod",
            filterByDate: true,
            customParametersMap: {
              productStoreId,
              shipmentMethodTypeId: "STOREPICKUP",
              shipmentMethodTypeId_op: "notEqual"
            },
            pageSize: 250,
            pageIndex: 0
          }
        });
        this.productStoreShipmentMethods[productStoreId] = resp.data?.entityValueList || resp.data?.docs || [];
        this.fetchStatus.productStoreShipmentMethods = "success";
      } catch (error: any) {
        logger.error(`Failed to fetch shipment methods for product store ${productStoreId}`, error);
        this.fetchStatus.productStoreShipmentMethods = "error";
      }
    },
    async seedSelectableValues(productStoreId?: string) {
      await Promise.allSettled([
        this.fetchStatusItemsByType("ORDER_STATUS"),
        this.fetchStatusItemsByType("SHIPMENT_STATUS"),
        this.fetchStatusItemsByType("RETURN_HEADER_STATUS"),
        this.fetchStatusItemsByType("PARTY_STATUS"),
        this.fetchEnumsByType("ORDER_SALES_CHANNEL"),
        this.fetchCarriers(),
        this.fetchShipmentMethodTypes(),
        productStoreId ? this.fetchProductStoreShipmentMethods(productStoreId) : Promise.resolve()
      ]);
    },
    async fetchStatusFlowTransitions() {
      this.fetchStatus.statusFlowTransitions = "pending";

      try {
        const resp = await api({
          url: "admin/statusFlows/transitions",
          method: "GET",
          params: {
            pageSize: 500
          }
        });
        const transitionsByStatusId = resp.data.reduce((transitions: Record<string, any[]>, transition: any) => {
          if (!transition.statusId) return transitions;
          const currentTransitions = transitions[transition.statusId] || [];
          currentTransitions.push(transition);
          transitions[transition.statusId] = currentTransitions;
          return transitions;
        }, {});

        for (const transitionList of Object.values(transitionsByStatusId)) {
          transitionList.sort((left: any, right: any) => {
            const leftSequence = left.transitionSequence ?? Number.MAX_SAFE_INTEGER;
            const rightSequence = right.transitionSequence ?? Number.MAX_SAFE_INTEGER;

            if (leftSequence !== rightSequence) return leftSequence - rightSequence;
            return (left.toStatusId || "").localeCompare(right.toStatusId || "");
          });
        }

        this.statusFlowTransitions = transitionsByStatusId;
        this.fetchStatus.statusFlowTransitions = "success";
      } catch (error: any) {
        logger.error("Failed to fetch status flow transitions", error);
        this.fetchStatus.statusFlowTransitions = "error";
      }
    },
    async fetchEntities(force = false) {
      if (this.entities.length && !force) return;

      this.fetchStatus.entities = "pending";
      try {
        const resp = await api({
          url: "moqui/entity/EntityServices/getEntityNames",
          method: "GET"
        });

        if (!resp.data.entityNames) throw new Error("Empty entity list");

        this.entities = resp.data.entityNames.sort();
        this.fetchStatus.entities = "success";
      } catch (error) {
        logger.error("Failed to fetch entities", error);
        this.fetchStatus.entities = "error";
      }
    },
    async fetchEntityFields(entityName: string, force = false) {
      if (!force && this.entityFields[entityName]?.length) return;

      this.fetchStatus.entityFields = "pending";
      try {
        const resp = await api({
          url: "moqui/entity/EntityServices/getEntityFields",
          method: "GET",
          params: { entityName }
        });

        if (resp.data.fields) {
          this.entityFields[entityName] = sortFields(resp.data.fields);
        } else if (resp.data.fieldNames) {
          this.entityFields[entityName] = sortFields(resp.data.fieldNames.map((fieldName: string) => ({ fieldName, description: "" })));
        } else {
          throw new Error("Empty field list");
        }
        this.fetchStatus.entityFields = "success";
      } catch (error) {
        logger.error(`Failed to fetch fields for entity ${entityName}`, error);
        this.fetchStatus.entityFields = "error";
      }
    }
  },
  persist: true,
});
