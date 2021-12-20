import JitsiMeetJS from '@lyno/lib-jitsi-meet';
import InitOptions from '@lyno/lib-jitsi-meet';
import { JitsiConferenceOptions } from '@lyno/lib-jitsi-meet/dist/JitsiConnection';
import JitsiConnection from '@lyno/lib-jitsi-meet/dist/JitsiConnection';
import JitsiConference from '@lyno/lib-jitsi-meet/dist/JitsiConference';
import JitsiTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiTrack';
import JitsiRemoteTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiRemoteTrack';

import { Disposable } from '@typed/disposable';
import { JitsiConferenceEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConferenceEvents';
import { JitsiConnectionEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionEvents';
import { JitsiLogLevels } from '@lyno/lib-jitsi-meet/dist/JitsiLogLevels';
import { JitsiConferenceErrors } from '@lyno/lib-jitsi-meet/dist/JitsiConferenceErrors';
import { JitsiConnectionErrors } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionErrors';

export interface JitsiMeetOptions {
	hosts?: any;
	logLevel?: JitsiLogLevels;
	roomName?: string;

	// These can be used to override the friendly configuration options
	connectionOptions?: typeof InitOptions | any;
	conferenceOptions?: JitsiConferenceOptions | any;
}

export class JitsiMeet implements Disposable {
	public connection: JitsiConnection | any;
	public conference: JitsiConference | any;

	public localTracks: JitsiTrack[] = [];
	public remoteTracks: JitsiRemoteTrack[] = [];

	private options: JitsiMeetOptions = {};

	/**
	 * Configuration for the public meet.jit.si instance. It only works via BOSH because the WebSockets connections are CORS-restricted. 
	 */
	public static get CONFIG_MEET_JIT_SI(): JitsiMeetOptions {
		return {
			logLevel: JitsiLogLevels.WARN,
			connectionOptions: {
				roomName: "", // The public Jitsi Meet instance seems to do extra routing on connection based on the room name, hence it must be provided before connecting. 
				hosts: {
					domain: "meet.jit.si",
					muc: "conference.meet.jit.si", // if this is wrong, the connection fails with Strophe: BOSH-Connection failed: improper-addressing
				},
				// Can either be a WebSockets (wss://...) or BOSH (.../http-bind) URL. WebSockets are generally preferable, but require the client to run on the same domain
				// as the host or the host to have cross_domain_websocket enabled (due to CORS). The properties bosh and websockets are deprecated in favor of this format. 
				// The value of the query parameter doesn't seem to have any effect, however it is set by the official client. 
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
				// Can either be a WebSockets (wss://...) or BOSH (.../http-bind) URL. WebSockets are generally preferable, but require the client to run on the same domain
				// as the host or the host to have cross_domain_websocket enabled (due to CORS). The properties bosh and websockets are deprecated in favor of this format. 
				serviceUrl: "https://localhost:8443/http-bind",
				hosts: {
					anonymousdomain: "meet.jitsi", // internal domain. meet.jitsi by default (docker). used for something something initial connection
					muc: "muc.meet.jitsi", // session coordinator. If this is wrong, the connection fails with Strophe: BOSH-Connection failed: improper-addressing
					focus: "focus.meet.jitsi", // video stream coordinator. If this is wrong, you won't see any video and get "Focus error"s on the console. 
				},
			}
		}
	}

	constructor(
		options: JitsiMeetOptions
	) {
		this.options = options;

		// Initialize
		JitsiMeetJS.init({});
		JitsiMeetJS.setLogLevel(this.options.logLevel);
	}

	/**
	 * Connect to the server. Returns the user's id if the connection was successful and throws an error if it was not. Prepares the conference. 
	 * @param roomName The room/conference you want to join, if not configured in connectionOptions. 
	 */
	public async connect(listeners?: Map<JitsiConnectionEvents, Function>): Promise<any> {
		return new Promise<any>(((resolve, reject) => {
			this.connection = new JitsiMeetJS.JitsiConnection(null, null, this.options.connectionOptions);

			// Success
			this.connection.addEventListener(JitsiConnectionEvents.CONNECTION_ESTABLISHED, (id) => resolve(id));

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
	* Called when the connection is established. Used for setup. 
	*/
	public async joinConference(name: string, listeners: Map<JitsiConferenceEvents, Function>): Promise<any> {
		if (name && this.options?.connectionOptions?.roomName) {
			console.warn(`Room name overridden by options.connectionOptions.roomName (${this.options.connectionOptions.roomName} instead of ${name}). You should only set one. `);
			name = this.options.connectionOptions.roomName;
		}
		return new Promise<any>(((resolve, reject) => {
			this.conference = this.connection.initJitsiConference(name.toLowerCase(), {});

			console.debug("connected", "Connection:", this.connection, "Conference:", this.conference);
			console.info("Connection succeeded!");

			// Success
			this.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_JOINED, () => this.conferenceJoined());
			this.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_JOINED, () => resolve(undefined));

			// Failure
			this.conference.on(JitsiConferenceEvents.CONNECTION_INTERRUPTED, (e: JitsiConferenceErrors) => reject(new Error(e)));
			this.conference.on(JitsiConferenceEvents.CONFERENCE_FAILED, (e: JitsiConferenceErrors) => reject(new Error(e)));

			// Add provided event listeners
			listeners?.forEach((listener, event: JitsiConferenceEvents) => {
				this.conference.addEventListener(event, listener);
			});

			this.conference.join(null, null);
		}));
	}

	/**
	* That function is executed when the conference is joined
	*/
	private conferenceJoined() {
		console.debug("onConferenceJoined", this.conference);

		console.info(`Conference ${this.conference.options.name} joined`);

		for (let i = 0; i < this.localTracks.length; i++) {
			this.conference.addTrack(this.localTracks[i]);
		}
	}

	public dispose(): void {
		this.unload();
		this.localTracks.forEach(track => {
			track.dispose()
		});
		this.remoteTracks.forEach(track => {
			track.dispose()
		});
	}

	/**
	*
	*/
	private unload() {
		console.debug("unload", this.localTracks);

		for (let i = 0; i < this.localTracks.length; i++) {
			this.localTracks[i].dispose();
		}
		this.conference.leave();
		this.connection.disconnect();
	}
}