const EventEmitter = require ('events').EventEmitter;
export const STATUS_READY = 'ready';
export const STATUS_REPL_REQ = 'repl_req';
export const STATUS_REPL_REQ_2 = 'repl_req_2';
export const STATUS_REPL = 'repl';
export const STATUS_RUNNING = 'running';
export const STATUS_STOPPED = 'stopped';
export const STATUS_OFFLINE = 'offline';

const STREAM_NULL = 0;
const STREAM_OUTPUT = 1;
const STREAM_ERROR = 2;
const BUFFER_SIZE = 32;

const RAW_REPL_TIMEOUT = 3000;
const LIST_FILES_TIMEOUT = 3000;

function escape (s) {
	s.replace(/\\/g, '\\\\')
		.replace(/\$/g, '\\$')
		.replace(/'/g, '\\\'')
		.replace(/"/g, '\\"');
	return s;
}

export class MicroPython extends EventEmitter {
	constructor(port){
		super();
		this.port = port;

		this.expectBuffer = '';
		this.expecting = false;
		this.expectStr = '';
		this.expectTimeout = null;
		this.expectResolve = null;
		this.expectReject = null;

		this.waitingStatus = null;
		this.waitResolve = null;
		this.waitReject = null;

		this.stream = STREAM_NULL;

		this.runSource = null;

		this.display = true;

		this.stdout = null;
		this.stderr = null;

		this.setStatus(STATUS_OFFLINE);
		port.on('connected', ()=>{
			this.emit('connected');
			this.setStatus(STATUS_READY);
		});

		port.on('data', (data)=>{			
			this.readBuffer (data);
		});
		port.on('error', (err)=>{
			this.emit('error', err);
		});
	}

	async listdir (folder) {
		let cmd = `import os
import json

def listdir(directory):
	ls = os.listdir(directory)
	r = []
	for f in ls:
		s = os.stat(f)   
		t = 'u'          
		if s[0] == 16384: 
			t = 'd' 
		elif s[0] == 32768:
			t = 'f'
		r.append({'f': f, 't': t, 's': s[6]})
	print(json.dumps(r))

listdir ('${escape(folder)}')`;
		let ls = null;
		try {
			let res = await this.execute (cmd);
			if (!res.stderr) {
				ls = JSON.parse (res.stdout);
			}
			// else
			// {
			// 	// TODO show notification
			// }
		}
		catch (e)
		{
			// TODO show notification
			ls = null;
		}
		return ls;
	}

	waitForStatus (status, timeout) {
		if (!this.waitingStatus) {
			this.waitingStatus = status;
			return new Promise ((resolve, reject) => {
				this.waitResolve = resolve;
				this.waitReject = reject;
				if (timeout > 0) this.waitTimeout = setTimeout ((() => {
					this.waitingStatus = null;
					reject ();
				}).bind(this), timeout);
			});
		}
		else {
			throw new Error ('Already waiting '+this.waitingStatus);
		}
	}

	async execute (cmd) {
		let s = this.waitForStatus (STATUS_STOPPED, LIST_FILES_TIMEOUT);
		await this.enterRawRepl ();
		await this.run (cmd, false);
		await s;
		return {
			stdout: this.stdout,
			stderr: this.stderr
		};
	}

	readBuffer (data) {
		this.expectBuffer = this.expectBuffer + Buffer.from (data).toString();
		if (this.expecting)
		{
			let index = this.expectBuffer.indexOf (this.expectStr);
			if (index > -1) {
				this.expectBuffer = this.expectBuffer.substring (index+this.expectStr.length);
				clearTimeout (this.expectTimeout);
				this.expecting = false;
				return this.expectResolve();
			}
		}
		else
		{
			let emitData = null;
			if(this.status === STATUS_READY)
			{
				emitData = this.expectBuffer;
				this.expectBuffer = '';
			}
			else
			if (this.status === STATUS_RUNNING) {
				let position;
				while ((position = this.expectBuffer.indexOf ('\x04')) > -1)
				{
					emitData = this.expectBuffer.substring (0, position);
					this.expectBuffer = this.expectBuffer.substring (position+1);
					
					if (this.stream === STREAM_OUTPUT)
					{
						this.stdout = this.stdout + emitData;
						if (this.display) this.emit ('data', emitData);
						this.emitData = null;
						this.stream = STREAM_ERROR;
					}
					else if (this.stream === STREAM_ERROR) {
						this.stderr = this.stderr + emitData;
						if (this.display) this.emit ('data', emitData);
						this.setStatus (STATUS_STOPPED);
						this.emitData = null;
						this.stream = STREAM_NULL;
						this.exitRawRepl ();
						// TODO switch this to previous status before STATUS_RUNNING
						// this.setStatus (STATUS_REPL);
					}
				}

				emitData = this.expectBuffer;
				this.expectBuffer = '';
				
				if (this.stream === STREAM_OUTPUT)
				{
					this.stdout = this.stdout + emitData;
				}
				else if (this.stream === STREAM_ERROR)
				{
					this.stderr = this.stderr + emitData;
				}
			}
			if (emitData && this.display === true) this.emit ('data', emitData);
		}
	}

	expect (str, timeout) {
		if (!this.expecting) {
			this.expecting = true;
			this.expectStr = str;
			return new Promise ((resolve, reject) => {
				this.expectResolve = resolve;
				this.expectReject = reject;
				if (timeout > 0) this.expectTimeout = setTimeout ((() => {
					this.expecting = false;
					reject ();
				}).bind(this), timeout);
			});
		}
		else {
			throw new Error ('Already expecting '+this.expectStr);
		}
	}

	sleep (mseconds) {
		return new Promise ((resolve) => {
			setTimeout (resolve, mseconds);
		});
	}

	async enterRawRepl()
	{
		let raw_repl = false;
		if (this.status !== STATUS_REPL)
		{
			try
			{
				// send ctrl+c 
				await this.write ('\r\x03');
				await this.sleep (0.1);
				await this.write ('\x03');
				await this.sleep (0.1);

				// wait for serial to flush
				await this.sleep (0.5);

				this.setStatus(STATUS_REPL_REQ);
				await this.write('\r\x01');
				await this.expect ('raw REPL; CTRL-B to exit\r\n>', RAW_REPL_TIMEOUT);
				await this.write('\x04');
				await this.expect ('soft reboot\r\n', RAW_REPL_TIMEOUT);
				await this.sleep (0.5);
				await this.write ('\x03');
				await this.sleep (0.1);
				await this.write ('\x03');
				await this.expect ('raw REPL; CTRL-B to exit\r\n>', RAW_REPL_TIMEOUT);
				this.setStatus(STATUS_REPL);
				raw_repl = true;
			}
			catch (e)
			{
				raw_repl = false;
			}
		}
		else
		{
			raw_repl = true;
			console.error ('Already requested repl or in repl');
		}
		return raw_repl;
	}

	async exitRawRepl()
	{
		this.display = true;
		let exit_raw_repl = false;
		if (this.status === STATUS_REPL || this.status === STATUS_STOPPED)
		{
			try
			{
				// send ctrl+c 
				await this.write ('\r\x02');
				this.setStatus(STATUS_READY);
				exit_raw_repl = true;
			}
			catch (e)
			{
				exit_raw_repl = false;
			}
		}
		else
		{
			exit_raw_repl = true;
			console.error ('Already exited repl or in repl');
		}
		return exit_raw_repl;
	}

	async run (source, display = true) {
		let running = true;
		if (this.status === STATUS_REPL) {
			this.display = display;
			this.stream = STREAM_NULL;
			this.stdout = '';
			this.stderr = '';
			// TODO write in packets of length 255 
			await this.write (source);
			await this.write ('\x04');
			// await this.expect('>', RAW_REPL_TIMEOUT);
			await this.expect('OK', RAW_REPL_TIMEOUT);
			this.setStatus (STATUS_RUNNING);
			this.stream = STREAM_OUTPUT;
			this.readBuffer ('');
		}
		else
		{
			running = false;
		}
		return running;
	}

	write(data)
	{
		if (typeof data === 'string') data = Buffer.from (data);
		this.port.write(data);
	}

	async writeRawRepl(commands){

		this.setStatus(STATUS_REPL);

		let command_bytes = Buffer.from(commands);

		for(let i = 0 ; i < command_bytes.length ; i=i+256)
		{       
			let subarray_command_bytes = command_bytes.slice(i,Math.min(i+256, command_bytes.length));
			await this.port.write(subarray_command_bytes);
		}
		
		this.setStatus(STATUS_RUNNING);

		await this.port.write(Buffer.from('\r\x04'));
		await this.port.write(Buffer.from('\r\x02'));

	}

	setStatus(status)
	{
		this.status = status;
		if (this.waitingStatus == status) {
			this.waitingStatus = null;
			if (this.waitResolve) this.waitResolve ();
		}
		this.emit('status', status);
		// if (this.runSource && this.status === STATUS_REPL) {
		// 	await this.write (this.runSource);
		// 	this.runSource = null;
		// 	this.setStatus (STATUS_RUNNING);
		// }
	}

	getStatus()
	{
		return this.status;
	}

	getPort()
	{
		return this.port;
	}

	async stop()
	{
		this.display = true;
		await this.port.write(Buffer.from('\r\x03'));
		await this.port.write(Buffer.from('\r\x02'));
		this.setStatus(STATUS_READY);
	}

	async reset()
	{
		await this.port.write(Buffer.from('\r\x04'));
		await this.port.write(Buffer.from('\r\x02'));
	}

}

// export class MicroPythonFiles extends EventEmitter {

// 	constructor(mp){
// 		super();
// 		this.mp = mp;
// 	}

// 	async get(filename)
// 	{
// 		command = 'import sys\nimport ubinascii\nwith open(\''+filename+'\', \'rb\') as infile:\nwhile True:\nresult = infile.read('+BUFFER_SIZE+')\nif result == b\'\':\nbreak\nlen=sys.stdout.write(ubinascii.hexlify(result))';
// 		this.mp.run(command);
// 		mp.on('data', (data)=> {
            
// 		});
		
// 		mp.on('error',(err) => {

// 		});
// 	}

// 	async mkdir(directory)
// 	{
// 		command = 'try:\nimport os\nexcept ImportError:\nimport uos as os\nos.mkdir(\''+directory+'\')';
// 		this.mp.run(command);
// 		mp.on('data', (data)=> {
            
// 		});
		
// 		mp.on('error',(err) => {

// 		});

// 	}

// }