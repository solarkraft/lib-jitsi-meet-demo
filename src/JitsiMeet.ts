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

export interface JitsiMeetOptions {
    hosts?: any;
	logLevel?: JitsiLogLevels;
	roomName?: string;

	// These can be used to override the friendly configuration options
	connectionOptions?: typeof InitOptions | any;
	conferenceOptions?: JitsiConferenceOptions | any;

    init?: Function;

}

export class JitsiMeet implements Disposable {
	public connection: JitsiConnection | any;
	public conference: JitsiConference | any;

	public localTracks: JitsiTrack[] = [];
	public remoteTracks: JitsiRemoteTrack[] = [];
	public isJoined: boolean = false;

	private options: JitsiMeetOptions = {};

	/**
	 * Configuration for the public meet.jit.si instance. It only works via BOSH because the WebSockets connections are CORS-restricted. 
	 */
	 public static get CONFIG_MEET_JIT_SI(): JitsiMeetOptions {
		return {
			logLevel: JitsiLogLevels.WARN,
			connectionOptions: {
				roomName: "talentedblocksgetthis",
				hosts: {
					domain: "meet.jit.si",
					muc: "conference.meet.jit.si", // if this is wrong, the connection fails with Strophe: BOSH-Connection failed: improper-addressing
				},
				// Can either be a WebSockets (wss://...) or BOSH (.../http-bind) URL. WebSockets are generally preferable, but require the client to run on the same domain
				// as the host or the host to have cross_domain_websocket enabled (due to CORS). The properties bosh and websockets are deprecated in favor of this format. 
				// The value of the query parameter doesn't seem to have any effect, however it is set by the official client. 
				get serviceUrl() { return "https://meet.jit.si/http-bind?room="+this.roomName; },
				// get serviceUrl() { return "https://localhost:8443/http-bind" }, // this would work
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
				roomName: "talentedblocksgetthis",
				hosts: {
					domain: "localhost:8443",
					muc: "muc.meet.jitsi", // session coordinator. If this is wrong, the connection fails with Strophe: BOSH-Connection failed: improper-addressing
					anonymousdomain: "meet.jitsi", // internal domain. meet.jitsi by default (docker). used for something something initial connection
					focus: "focus.meet.jitsi", // video stream coordinator
				},
				// Can either be a WebSockets (wss://...) or BOSH (.../http-bind) URL. WebSockets are generally preferable, but require the client to run on the same domain
				// as the host or the host to have cross_domain_websocket enabled (due to CORS). The properties bosh and websockets are deprecated in favor of this format. 
				// The value of the query parameter doesn't seem to have any effect, however it is set by the official client. 
				get serviceUrl() { return "https://localhost:8443/http-bind?room="+this.roomName; },
				// get serviceUrl() { return "https://localhost:8443/http-bind" }, // this would work
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
	public async connect(roomName?: string, listeners?: Map<JitsiConnectionEvents, Function>): Promise<any> {
		if(this.options?.connectionOptions?.roomName) {
			this.options.connectionOptions.roomName = roomName;
		}

		return new Promise<any>(((resolve, reject) => {
			this.connection = new JitsiMeetJS.JitsiConnection(null, null, this.options.connectionOptions);

			this.connection.addEventListener(JitsiConnectionEvents.CONNECTION_ESTABLISHED, (id) => resolve(id));

			// Errors
			this.connection.addEventListener(JitsiConnectionEvents.CONNECTION_FAILED, (msg) => reject(new Error("CONNECTION_FAILED" + msg)));
			this.connection.addEventListener(JitsiConnectionEvents.WRONG_STATE, (msg) => reject(new Error("WRONG_STATE" + msg)));
			this.connection.addEventListener(JitsiConnectionEvents.DISPLAY_NAME_REQUIRED, (msg) => reject(new Error("DISPLAY_NAME_REQUIRED" + msg)));
			// TODO: Use JitsiConnectionErrors?

			// Add provided event listeners
			listeners?.forEach((listener, event) => this.connection.addEventListener(event, listener));

			this.connection.connect({});
		}));
	}

	/**
	* Called when the connection is established. Used for setup. 
	*/
	public async joinConference(roomId: string, listeners: Map<JitsiConferenceEvents, Function>): Promise<any> {
		return new Promise<any>(((resolve, reject) => {
			this.conference = this.connection.initJitsiConference(this.options.connectionOptions.roomName, {});

			console.debug("connected", "Connection:", this.connection, "Conference:", this.conference);
			console.info("Connection succeeded!");

			this.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_JOINED, () => this.conferenceJoined());
			this.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_JOINED, () => resolve(null));

			// Errors
			this.conference.on(JitsiConferenceEvents.CONNECTION_INTERRUPTED, () => reject(JitsiConferenceEvents.CONNECTION_INTERRUPTED));
			this.conference.on(JitsiConferenceEvents.CONFERENCE_FAILED, () => reject(JitsiConferenceEvents.CONNECTION_INTERRUPTED));
			this.conference.on(JitsiConferenceEvents.CONNECTION_INTERRUPTED, () => reject(JitsiConferenceEvents.CONNECTION_INTERRUPTED));
			// TODO: Use JitsiConferenceErrors?

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

		this.isJoined = true;
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