var studio = null;

export function setup (options, imports, register)
{
	studio = imports;

	imports.events.on ('ready', (imports) => 
	{
		// add optional imports
		studio = imports;

		/* Register Pin Layout */
		if (studio.pin_layout)
		{
			studio.pin_layout.registerPinLayout ('wyapp', 'beagleboneblack', 'plugins/device.wyapp.beagleboneblack/data/img/pins-beagleboneblack.png');
		}
		else
		{
			studio.workspace.warn ('device.wyapp.beagleboneblack: pin_layout plugin is not available');
		}
	});

	let beagleboneblack = {
		/** 
		 * Device Icon 
		*/
		iconURL ()
		{
			return 'plugins/device.wyapp.beagleboneblack/data/img/icon-beagleboneblack.png';
		},

		/**
		 * Found a device, modify stuff (like icon)
		 * @param {Device} device 
		 */
		found (device)
		{
			device.icon = this.iconURL ();
			if (!device.description) device.description = 'BeagleBone Black';
		},

		/**
		 * Update a device, modify stuff
		 * @param {Device} device 
		 */
		// update (device)
		// {
			
		// },

		/**
		 * Modidify the project before run
		 * @param {Project} project - the project
		 */
		run (project)
		{
			project;
		}
	};

	/* Register Icon */
	studio.device_wyapp.registerBoard ('beagleboneblack', beagleboneblack);

	register (null, {});
}