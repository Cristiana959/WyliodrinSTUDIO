export default {
	namespaced: true,
	state: 
	{
		runningEmulators: {},
		images: [],
		qemuCheck: false,
		activeTab: 1,
	},
	getters: 
	{
		runningEmulators: (state) => state.runningEmulators,
		images: (state) => state.images,
		qemuCheck: (state) => state.qemuCheck,
		activeTab: (state) => state.activeTab,
	},
	actions:
	{
		runningEmulators: ({commit}, runningEmulators) => commit('runningEmulators', runningEmulators),
		images: ({commit}, images) => commit('images', [...images]),
		qemuCheck: ({commit}, qemuCheck) => commit('qemuCheck', qemuCheck),
		updateDownloadProgress: ({commit}, data) => { commit ('updateDownloadProgress', data);},
		activeTab: ({commit}, activeTab) => commit('activeTab', activeTab),

	},
	mutations:
	{
		runningEmulators: (state, value) => state.runningEmulators = value,
		images: (state, value) => state.images = value,
		updateDownloadProgress: (state, {image, progress}) => {
			let index = state.images.findIndex(img => img.id === image.id);
			if (index >= 0)
			{
				state.images[index].progress = progress;
			}
		},
		qemuCheck: (state, value) => state.qemuCheck = value,
		activeTab: (state, value) => state.activeTab = value
	}
};