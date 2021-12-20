import JitsiMeetJS from '@lyno/lib-jitsi-meet';
import { CreateLocalTracksOptions, InitOptions } from "@lyno/lib-jitsi-meet/";
import { JitsiConferenceEvents } from "@lyno/lib-jitsi-meet/dist/JitsiConferenceEvents";
import { JitsiConferenceOptions } from "@lyno/lib-jitsi-meet/dist/JitsiConnection";
import { JitsiLogLevels } from "@lyno/lib-jitsi-meet/dist/JitsiLogLevels";
import JitsiRemoteTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiRemoteTrack';
import JitsiLocalTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiLocalTrack';
import JitsiConference from "@lyno/lib-jitsi-meet/JitsiConference";
import JitsiConnection from "@lyno/lib-jitsi-meet/JitsiConnection";
import { Disposable } from "@typed/disposable";
import { JitsiConnectionEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionEvents';
import { JitsiConnectionErrors } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionErrors';
import { JitsiConferenceErrors } from '@lyno/lib-jitsi-meet/dist/JitsiConferenceErrors';

export interface ConnectionOptions {
	/** The main address of your server. Can either be a WebSockets (wss://.../xmpp-websocket) or BOSH (.../http-bind) URL. 
	 *  WebSocket is generally preferable. The properties `bosh` and `websocket` are deprecated in favor of this one. 
	 *  The server needs to be configured to allow CORS with the domain your app runs on. The meet.jit.si instance has it enabled
	 *  for BOSH, on a docker instance you can enable it by setting the environment variable `XMPP_CROSS_DOMAIN=true`. */
	serviceUrl?: string,
	hosts: {
		/** Base domain. Only necessary on the public instance. Causes focus errors if set wrongly. */
		domain?: string,
		/** Internal domain of the "Multi user chat" (XMPP room/Session coordination). If this is wrong, the connection fails 
		 *  silently when using the WebSocket or with Strophe: BOSH-Connection failed: improper-addressing
		 *  when using BOSH. Default: muc.meet.jitsi (docker) or conference.meet.jit.si (official instance).
		 *  Does not need to be publicly accessible. */
		muc?: string,
		/** Internal base domain. Likely used to infer others. Default (docker): meet.jitsi (undefined on public instance) */
		anonymousdomain?: string,
		/** Video stream coordinator. If this is wrong, you won't see any video and get "Focus error"s on the console. 
		 *  Default (docker): `focus.meet.jitsi` */
		focus?: string,
	},
	/** Can be used to change the `serviceUrl` when it is a get only property (meet.jit.si config).
	 *  `room?=... query parameter` is automatically appendend. */
	baseServiceUrl?: string,
	/** If your Jitsi Meet instance does additional routing of users based on the requested room
	 *  name passed in the serviceUrl `?room=...` query parameter, you may need to specify the room
	 *  name on connection. So far this behavior has only been seen on the public meet.jit.si instance. */
	roomName?: string;
	/** May be necessary to prevent a type error when it is attempted to be modified. Only seen used on meet.jit.si */
	deploymentInfo?: {}
	[key: string]: any; // Allow any more options to be passed since there's a lot more that can be configured
}

export interface JitsiMeetOptions {
	logLevel?: JitsiLogLevels;
	initOptions?: InitOptions;
	connectionOptions?: ConnectionOptions;
	conferenceOptions?: JitsiConferenceOptions;
	trackOptions?: CreateLocalTracksOptions
}

export class JitsiMeet implements Disposable {
	public connection: JitsiConnection;
	public conference: JitsiConference;

	public localTracks: JitsiLocalTrack[] = [];
	public remoteTracks: JitsiRemoteTrack[] = [];

	private options: JitsiMeetOptions = {};

	private connectionEventListeners: Map<JitsiConnectionEvents, Function>;
	private conferenceEventListeners: Map<JitsiConferenceEvents, Function>;

	/**
	 * Configuration for the public meet.jit.si instance. It only works via BOSH because the WebSockets connections are CORS-restricted. 
	 */
	public static get CONFIG_MEET_JIT_SI(): JitsiMeetOptions {
		return {
			logLevel: JitsiLogLevels.WARN,
			connectionOptions: {
				// The public Jitsi Meet instance seems to do extra routing on connection based on the room name, hence it must be provided before connecting. 
				roomName: "",
				hosts: {
					domain: "meet.jit.si",
					muc: "conference.meet.jit.si",
				},
				baseServiceUrl: "https://meet.jit.si/http-bind?room=",
				get serviceUrl() { return this.baseServiceUrl + this.roomName.toLowerCase(); },
				deploymentInfo: {}, // Gets rid of an error when Strophe tries to add properties (only seen on meet.jit.si)
			}
		}
	}

	/**
	 * Configuration for a docker installation (https://github.com/jitsi/docker-jitsi-meet) running on localhost with default values
	 */
	public static get CONFIG_DOCKER(): JitsiMeetOptions {
		return {
			logLevel: JitsiLogLevels.WARN,
			connectionOptions: {
				// serviceUrl: "https://localhost:8443/http-bind",
				serviceUrl: "wss://localhost:8443/xmpp-websocket",
				hosts: {
					anonymousdomain: "meet.jitsi", // Internal domain. meet.jitsi by default (docker). may be used to infer others. 
					muc: "muc.meet.jitsi", // Session coordinator. If this is wrong, the connection fails with Strophe: BOSH-Connection failed: improper-addressing
					focus: "focus.meet.jitsi", // Video stream coordinator. If this is wrong, you won't see any video and get "Focus error"s on the console. 
				},
			}
		}
	}

	constructor(options: JitsiMeetOptions) {
		this.options = options;

		// Initialize
		JitsiMeetJS.init(this.options.initOptions || {});
		if (this.options.logLevel) {
			JitsiMeetJS.setLogLevel(this.options.logLevel);
		}
	}

	/**
	 * Connect to the server. Returns the user's id if the connection was successful and throws an error if it was not. Prepares the conference. 
	 * @param roomName The room/conference you want to join, if not configured in connectionOptions. 
	 */
	public async connect(listeners?: Map<JitsiConnectionEvents, Function>): Promise<string> {
		return new Promise<string>(((resolve, reject) => {
			// Event listener preservation in case connect is called again without the listeners parameter
			if (listeners) {
				this.connectionEventListeners = listeners;
			} else {
				listeners = this.connectionEventListeners;
			}

			this.connection = new JitsiMeetJS.JitsiConnection(null, null, this.options.connectionOptions);

			// Success
			this.connection.addEventListener(JitsiConnectionEvents.CONNECTION_ESTABLISHED, (id: string) => resolve(id));

			// Failure
			this.connection.addEventListener(JitsiConnectionEvents.CONNECTION_FAILED, (e: JitsiConnectionErrors) => reject(new Error(e)));
			this.connection.addEventListener(JitsiConnectionEvents.WRONG_STATE, (e: JitsiConnectionErrors) => reject(new Error(e)));
			this.connection.addEventListener(JitsiConnectionEvents.DISPLAY_NAME_REQUIRED, (e: JitsiConnectionErrors) => reject(new Error(e)));

			// Add provided event listeners
			listeners?.forEach((listener, event) => this.connection.addEventListener(event, listener));

			this.connection.connect({});
		}));
	}

	/**
	 * Join a new conference or leave the current conference and join another. Triggers leaveConference on an empty room name. 
	 * Seemingly only one conference is supported per connection by JitsiMeetJS. 
	 * @param name The name of the conference to join. Can be any string. Example: ParallelPerceptionsDefineReasonably. Automatically transformed to lower case. 
	 * @param listeners Listeners for events on the conference to add before the conference is joined. If this parameter is not provided, there will be an attempt to use eventListeners from the previous run. 
	 * @returns true if a new conference was joined, false if the method was aborted due to already being in that conference or the room name being empty. 
	 */
	public async joinConference(name: string, listeners?: Map<JitsiConferenceEvents, Function>): Promise<boolean> {
		name = name.toLowerCase();
		// TODO: Cancel other already running joinConference()s
		if (!this.connection) { console.info("joinConference has been called without an existing connection, doing nothing"); return; }

		console.debug("joinConference");
		if (name && this.options?.connectionOptions?.roomName) {
			console.warn(`Room name overridden by options.connectionOptions.roomName (${this.options.connectionOptions.roomName} instead of ${name}). You should only set one. `);
			name = this.options.connectionOptions.roomName;
		}

		return new Promise<boolean>(async (resolve, reject) => {
			// Event listener preservation in case joinConference is called again without the listeners parameter
			if (listeners) {
				this.conferenceEventListeners = listeners;
			} else {
				listeners = this.conferenceEventListeners;
			}

			// This would be invalid. Leave the conference. 
			if (!name) {
				await this.leaveConference();
				resolve(false);
				return;
			}

			// Already in a conference
			if (this.conference?.isJoined()) {
				let currentConference = this.conference.getName();
				console.info("Already in conference", currentConference);

				if (this.conference?.getName() === name.toLowerCase()) {
					console.info(`That's the same conference as requested (${name}), doing nothing`);
					resolve(false);
					return;
				} else {
					console.info(`Leaving ${currentConference} to join ${name}`);
					this.leaveConference()
					await this.joinConference(name, listeners);
					resolve(true);
					return;
				}
			}
			this.conference = this.connection.initJitsiConference(name.toLowerCase(), {});

			// Success
			this.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_JOINED, () => resolve(true));

			// Failure
			this.conference.on(JitsiConferenceEvents.CONNECTION_INTERRUPTED, (e: JitsiConnectionErrors) => reject(new Error(e)));
			this.conference.on(JitsiConferenceEvents.CONFERENCE_FAILED, (e: JitsiConferenceErrors) => reject(new Error(e)));

			// Add provided event listeners
			listeners?.forEach((listener, event: JitsiConferenceEvents) => {
				this.conference.addEventListener(event, listener);
			});

			this.conference.join(null, null);
		});
	}

	/**
	 * Leave the current conference
	 * @param listeners Event listeners to add before the conference is left
	 * @returns true if the conference was left, false if there is no conference to leave
	 */
	public async leaveConference(listeners?: Map<JitsiConferenceEvents, Function>): Promise<boolean> {
		console.info("leaveConference");
		return new Promise<boolean>(async (resolve) => {
			if (!this.conference?.isJoined()) {
				console.debug("No conference joined to leave");
				resolve(false);
				return;
			}

			this.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_LEFT, () => resolve(true));

			this.conference.leave();
			this.conference = null;

			// JitsiMeetJS keeps adding listeners for this event, but never removes them. Would eventually cause a memory leak warning
			// ("Possible EventEmitter memory leak detected. 11 xmpp.speaker_stats_received listeners added")
			this.connection.xmpp.eventEmitter.removeAllListeners("xmpp.speaker_stats_received");
		});
	}

	/** Create local tracks (audio/video/desktop) and add them to the current conference. 
	 * Will take provided CreateLocalTracksOptions, the value from options.trackOptions or a default value (audio and video). 
	 * @param options CreateLocalTracksOptions
	 * @returns true
	 */
	public async createLocalTracks(options?: CreateLocalTracksOptions): Promise<void> {
		let tracksOptions = options || this.options.trackOptions || { devices: ['audio', 'video'] };

		return new Promise<void>(async (resolve, reject) => {
			console.debug("Creating local tracks", this.conference)
			let tracks: JitsiLocalTrack[] = await JitsiMeetJS.createLocalTracks(tracksOptions) as JitsiLocalTrack[];
			console.debug("Tracks:", tracks);

			this.localTracks = tracks;
			resolve();
		});
	}

	public async disconnect() {
		await this.leaveConference();
		this.connection?.disconnect();

		this.conference = null;
		this.connection = null;
	}

	public dispose(): void {
		this.disconnect();

		this.remoteTracks.forEach(track => {
			console.debug("Disposing remote track", track)
			track.dispose()
		});
		this.localTracks.forEach(track => {
			console.debug("Disposing local track", track)
			track.dispose()
		});
	}
}