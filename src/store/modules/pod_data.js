import Vue from 'vue';

const kubeclient = require("kubernetes-client");
const client = new kubeclient.Client1_13();

function kubeDataSortComparison(a, b) {
  if(a.metadata.namespace == b.metadata.namespace) {
    if(a.metadata.name == b.metadata.name) {
      return a.metadata.uid.localeCompare(b.metadata.uid);
    }
    return a.metadata.name.localeCompare(b.metadata.name);
  }
  return a.metadata.namespace.localeCompare(b.metadata.namespace);
}

function getKey(podItem) {
  return podItem.metadata.uid;
}

var podStream = null;
var svcStream = null;

const state = {
  status: false,
  message: "Loading",
  pod_data: {
      metadata: null, 
      items: {} 
  },  
  svc_data: {
    metadata: null,
    items: {}
  },
  open_consoles: {
    items: []
  },
  open_logs: {
    items: []
  }
}

// getters
const getters = {
  getMessage: (state) => {
    return state.message;
  },
  getStatus: (state) => {
    return state.status;
  },
  orderedPodItems: (state) => {
    var sorted = [];
    if (state.status) {
      sorted = Object.values(state.pod_data.items);
      sorted.sort(kubeDataSortComparison);
    }
    return sorted;
  },
  getPodData: (state) => (podUid) => {
    return state.pod_data.items[podUid];
  },
  orderedSvcItems: (state) => {
    var sorted = [];
    if (state.status) {
      sorted = Object.values(state.svc_data.items);
      sorted.sort(kubeDataSortComparison);
    }
    return sorted;
  },
  getSvcData: (state) => (svcUid) => {
    return state.svc_data.items[svcUid];
  },
  getOpenConsoles: (state) => {
    return state.open_consoles.items;
  },
  getOpenLogs: (state) => {
    return state.open_logs.items;
  }
}

// actions
const actions = {
  stopPodWatch: function() {
    return new Promise((resolve) => {
      if (podStream) {
        podStream.destroy();
        podStream = null;
      }
      resolve();
    });
  },
  fetchPodData: function({ commit }) {
    return new Promise((resolve, reject) => {
      client.api.v1.pods.get().then(
        res => {
          var podData = {
            items: {} 
          };
          podData.metadata = res.body.metadata;
          for (var item in res.body.items) {
            var itemdata = res.body.items[item];
            var objKey = getKey(itemdata);
  
            podData.items[objKey] = itemdata;
          }
          
          commit('setStatusAndPodData', {connStatus: true, message: "Success", podData: podData});
          resolve();
        },
        err => {
          console.log("Error (getPodData) " + err);
          commit('setStatusAndPodData', { connStatus: false, message: err , podData: { metadata: null, items: {} }});
          reject();
        }
      );
    });    
  },
  watchPodData: async function({ commit, state }) {
    var rv = state.pod_data.metadata.resourceVersion;
    podStream = await client.api.v1.watch.pods.getObjectStream({
      qs: {
        resourceVersion: rv,
      }
    });

    podStream.on("data", res => {
      var pod_item = res.object;
      if (res.type === "ADDED") {
        // eslint-disable-next-line
        pod_item = (({ kind, apiVersion, ...others }) => ({ ...others }))(
          res.object
        );
        commit('setPodItem', pod_item);
        console.log("new object : " + pod_item.metadata.name + " : " + pod_item.metadata.uid);
      } else if (res.type === "MODIFIED") {
        // eslint-disable-next-line
        pod_item = (({ kind, apiVersion, ...others }) => ({ ...others }))(
          res.object
        );
        commit('setPodItem', pod_item);
        console.log("changed object : " + pod_item.metadata.name + " : " + pod_item.metadata.uid);
      } else if (res.type === "DELETED") {
        // eslint-disable-next-line
        pod_item = (({ kind, apiVersion, ...others }) => ({ ...others }))(
          res.object
        );
        commit('deletePodItem', pod_item);
        console.log("deleted object : " + pod_item.metadata.name + " : " + pod_item.metadata.uid);
      } else {
        console.error("unknown type: " + JSON.stringify(res));
      }
    });
  },
  deletePod: function({ state }, pod_uid) {
    var podToRemove = state.pod_data.items[pod_uid];
    if(podToRemove) {
      var namespace = podToRemove.metadata.namespace;
      var name = podToRemove.metadata.name;
      client.api.v1.namespaces(namespace).pods(name).delete();
    }
  },
  fetchSvcData: function({ commit }) {
    return new Promise((resolve, reject) => {
      client.api.v1.services.get().then(
        res => {
          var svcData = {
            items: {} 
          };
          svcData.metadata = res.body.metadata; 
          for (var item in res.body.items) {
            var itemdata = res.body.items[item];
            var objKey = getKey(itemdata);
  
            svcData.items[objKey] = itemdata;
          }
          
          commit('setStatusAndSvcData', {connStatus: true, message: "Success", svcData: svcData});
          resolve();
        },
        err => {
          console.log("Error (getSvcData) " + err);
          commit('setStatusAndSvcData', { connStatus: false, message: err , svcData: { metadata: null, items: {} }});
          reject();
        }
      );
    });    
  },
  deleteSvc: function({ state }, svc_uid) {
    var svcToRemove = state.svc_data.items[svc_uid];
    if(svcToRemove) {
      var namespace = svcToRemove.metadata.namespace;
      var name = svcToRemove.metadata.name;
      client.api.v1.namespaces(namespace).services(name).delete();
    }
  },
  stopSvcWatch: function() {
    return new Promise((resolve) => {
      if (svcStream) {
        svcStream.destroy();
        svcStream = null;
      }
      resolve();
    });
  },
  watchSvcData: async function({ commit, state }) {
    var rv = state.svc_data.metadata.resourceVersion;
    svcStream = await client.api.v1.watch.services.getObjectStream({
      qs: {
        resourceVersion: rv,
      }
    });

    svcStream.on("data", res => {
      var svc_item = res.object;
      if (res.type === "ADDED") {
        // eslint-disable-next-line
        svc_item = (({ kind, apiVersion, ...others }) => ({ ...others }))(
          res.object
        );
        commit('setSvcItem', svc_item);
        console.log("new svc : " + svc_item.metadata.name + " : " + svc_item.metadata.uid);
      } else if (res.type === "MODIFIED") {
        // eslint-disable-next-line
        svc_item = (({ kind, apiVersion, ...others }) => ({ ...others }))(
          res.object
        );
        commit('setSvcItem', svc_item);
        console.log("changed svc : " + svc_item.metadata.name + " : " + svc_item.metadata.uid);
      } else if (res.type === "DELETED") {
        // eslint-disable-next-line
        svc_item = (({ kind, apiVersion, ...others }) => ({ ...others }))(
          res.object
        );
        commit('deleteSvcItem', svc_item);
        console.log("deleted svc : " + svc_item.metadata.name + " : " + svc_item.metadata.uid);
      } else {
        console.error("unknown type: " + JSON.stringify(res));
      }
    });
  },
  openConsole: function({ commit, getters }, { podUid, shellType } ) {
    var podSpec = getters.getPodData(podUid)
    commit('addOpenConsole', {podUid: podUid, podNamespace: podSpec.metadata.namespace, podName: podSpec.metadata.name, shellType: shellType })
  },
  deleteOpenConsole: function({ commit }, index ) {
    commit('deleteOpenConsole', {index: index })
  },
  openLog: function({ commit, getters }, { podUid }) {
    var podSpec = getters.getPodData(podUid)
    commit('addOpenLog', {podUid: podUid, podNamespace: podSpec.metadata.namespace, podName: podSpec.metadata.name, podSpec: podSpec })
  },
  closeLog: function({ commit }, index ) {
    commit('deleteOpenLog', {index: index })
  },
}

// mutations
const mutations = {
  setStatusAndPodData (state, { connStatus, message, podData }) {
      state.status = connStatus;
      state.message = message;
      Vue.set(state, 'pod_data', podData);
  },
  setPodItem (state, podData) {
    Vue.set(state.pod_data.items, getKey(podData), podData);
  },
  deletePodItem(state, podData) {
    Vue.delete(state.pod_data.items, getKey(podData));
  },
  setStatusAndSvcData (state, { connStatus, message, svcData }) {
    state.status = connStatus;
    state.message = message;
    Vue.set(state, 'svc_data', svcData);
  },
  setSvcItem (state, svcData) {
    Vue.set(state.svc_data.items, getKey(svcData), svcData);
  },
  deleteSvcItem(state, svcData) {
    Vue.delete(state.svc_data.items, getKey(svcData));
  },
  addOpenConsole(state, { podUid, podNamespace, podName, shellType }) {
    state.open_consoles.items.push({podSpec: {podUid: podUid, podNamespace: podNamespace, podName: podName}, shellType: shellType})
  },
  deleteOpenConsole(state, { index }) {
    state.open_consoles.items.splice(index, 1)
  },
  addOpenLog(state, { podUid, podNamespace, podName, podSpec }) {
    state.open_logs.items.push({logDetails: {podUid: podUid, podNamespace: podNamespace, podName: podName, podSpec: podSpec}})
  },
  deleteOpenLog(state, { index }) {
    state.open_logs.items.splice(index, 1)
  },
}

export default {
  state,
  getters,
  actions,
  mutations
}
