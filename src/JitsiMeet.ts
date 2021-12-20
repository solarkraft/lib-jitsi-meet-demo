import JitsiMeetJS from '@lyno/lib-jitsi-meet';
import InitOptions from '@lyno/lib-jitsi-meet';
import { JitsiConferenceOptions } from '@lyno/lib-jitsi-meet/dist/JitsiConnection';
import JitsiConnection from '@lyno/lib-jitsi-meet/dist/JitsiConnection';
import JitsiConference from '@lyno/lib-jitsi-meet/dist/JitsiConference';
import JitsiLocalTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiLocalTrack';
import JitsiTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiTrack';
import JitsiRemoteTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiRemoteTrack';

import { Disposable } from '@typed/disposable';
import { JitsiConferenceEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConferenceEvents';
import { JitsiConnectionEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionEvents';
import { JitsiTrackEvents } from '@lyno/lib-jitsi-meet/dist/JitsiTrackEvents';
import { JitsiLogLevels } from '@lyno/lib-jitsi-meet/dist/JitsiLogLevels';

export interface JitsiMeetOptions {
	connectionOptions?: typeof InitOptions | any,
	conferenceOptions?: JitsiConferenceOptions | any,
	logLevel?: JitsiLogLevels,
}

export class JitsiMeet implements Disposable {
	public connection: JitsiConnection | any;
	public conference: JitsiConference | any;

	public localTracks: JitsiTrack[] = [];
	public remoteTracks: JitsiRemoteTrack[] = [];
	public isJoined: boolean = false;

	readonly host: string; /** The host's domain name. Example: meet.jit.si */
	readonly roomId: string;

	private eventListeners = new Map<Function, JitsiConnectionEvents | JitsiConferenceEvents>(); // Kept to facilitate cleanup on dispose()
	private options: JitsiMeetOptions = {};

	constructor(
		host: string = "meet.jit.si",
		roomId: string = "TownHall",
		userOptions?: JitsiMeetOptions,
	) {
		this.host = host.toLowerCase();
		this.roomId = roomId.toLowerCase();

		// This has only been tested with meet.jit.si. Other installations may be configured differently. 
		this.options.connectionOptions = {
			hosts: {
				domain: this.host,
				muc: `conference.${this.host}`,
			},
			// Can either be a WebSockets (wss://...) or BOSH (.../http-bind) URL. WebSockets are generally preferable, but require the client to run on the same domain
			// as the host or the host to have cross_domain_websocket enabled (due to CORS). The properties bosh and websockets are deprecated in favor of this format. 
			serviceUrl: `https://${this.host}/http-bind?room=${this.roomId}`,

			deploymentInfo: {}, // Gets rid of a type error

			// Not strictly necessary
			enableWindowOnErrorHandler: true,
			disableThirdPartyRequests: true,
		};

		let options: JitsiMeetOptions = {
			connectionOptions: {},
			conferenceOptions: {},
			logLevel: JitsiLogLevels.WARN
		}
		// Object.assign(options, userOptions);

		// Initialize
		JitsiMeetJS.init({});
		JitsiMeetJS.setLogLevel(options.logLevel);

		this.connection = new JitsiMeetJS.JitsiConnection(null, null, this.options.connectionOptions); // app id and token are generally not required

		// this.connectSync();
	}

	public async connect(): Promise<any> {
		return new Promise<any>(((resolve, reject) => {
			this.connection = new JitsiMeetJS.JitsiConnection(null, null, this.options.connectionOptions);

			this.connection.addEventListener(JitsiConnectionEvents.CONNECTION_ESTABLISHED, (id) => {
				this.conference = this.connection.initJitsiConference("conference", {});
				resolve({ id });
			});

			this.connection.connect({});
		}));
	}

	/**
	* Called when the connection is established. Used for setup. 
	*/
	public async joinConference(): Promise<any> {
		return new Promise<any>(((resolve, reject) => {
			console.debug("connected", "Connection:", this.connection, "Conference:", this.conference);
			console.info("Connection succeeded!");


			this.conference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () => this.conferenceJoined());
			this.conference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () => resolve(null));

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

	/**
	 * Adds an event listener of the type JitsiConnectionEvents,  JitsiConferenceEvents or JitsiTrackEvents. For JitsiTrackEvents the listener is added for each local track. 
	 * Make sure to pass your listener using a closure (() => object.method()) to preserve the value of `this`. 
	 * @param ev 
	 */
	public addEventListener(event: JitsiConnectionEvents | JitsiConferenceEvents | JitsiTrackEvents, listener: () => void): void {
		JitsiMeetJS.events.connection;

		if (!listener) {
			throw new Error("No listener was provided");
		}

		if (event.startsWith("connection.")) {
			console.debug("Adding listener for connection event", event);
			if (!this.connection) {
				throw new Error("The connection hasn't been created yet!");
			}
			this.connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, listener);
			this.eventListeners.set(listener, event as JitsiConnectionEvents | JitsiConferenceEvents);

		} else if (event.startsWith("conference.")) {
			if (!this.connection) {
				throw new Error("The conference hasn't been created yet!");
			}
			console.debug("Adding listener for conference event", event);
			this.eventListeners.set(listener, event as JitsiConnectionEvents | JitsiConferenceEvents);

		} else if (event.startsWith("track.")) {

			console.debug("Adding listener for track event (to all local tracks)", event);
			this.localTracks.forEach((track: JitsiLocalTrack) => {
				track.addEventListener(event, listener);
			});
			// Doesn't need to be added to the list as it can't be removed anyway
		} else {
			throw new Error("Unknown event!");
		}
	}

	/**
	 * Alias for addEventListener
	 */
	public on(event: JitsiConnectionEvents | JitsiConferenceEvents | JitsiTrackEvents, listener: (...args: any[]) => void): void {
		this.addEventListener(event, listener);
	}

	/**
	 * Removes an event listener that was previously added using addEventListener(). 
	 * @param listener 
	 * @param event 
	 */
	public removeEventListener(listener: Function, event: JitsiConnectionEvents | JitsiConferenceEvents): void {
		if (event.startsWith("connection.")) {
			console.debug("Removing listener for connection event", event);
			this.connection.removeEventListener(event, listener);

		} else if (event.startsWith("conference.")) {
			console.debug("Removing listener for conference event ....", event);
			this.conference.removeEventListener(event, listener);
		}

		// Remove listener from Map
		this.eventListeners.delete(listener)
	}

	public dispose(): void {
		this.unload();
		this.localTracks.forEach(track => {
			track.dispose()
		});
		this.remoteTracks.forEach(track => {
			track.dispose()
		});
		this.removeAllEventListeners();
	}

	/**
	 * Removes all registered event listeners. Used in dispose(). 
	 */
	private removeAllEventListeners() {
		console.info("Removing all event listeners");

		this.eventListeners.forEach((event, listener) => {
			console.info(`Removing listener ${listener} for event ${event}`);
			this.removeEventListener(listener, event);
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