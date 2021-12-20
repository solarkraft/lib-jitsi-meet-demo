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

export interface JitsiMeetOptions {
	logLevel?: JitsiLogLevels;
	connectionOptions?: InitOptions | any;
	conferenceOptions?: JitsiConferenceOptions;
	trackOptions?: CreateLocalTracksOptions
}

export class JitsiMeet implements Disposable {
	public connection: JitsiConnection;
	public conference: JitsiConference;

	public localTracks: JitsiLocalTrack[] = [];
	public remoteTracks: JitsiRemoteTrack[] = [];

	private options: JitsiMeetOptions = {};

	private conferenceEventListeners: Map<JitsiConferenceEvents, Function>;

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
				// serviceUrl: "https://localhost:8443/http-bind",
				serviceUrl: "wss://localhost:8443/xmpp-websocket",
				hosts: {
					anonymousdomain: "meet.jitsi", // internal domain. meet.jitsi by default (docker). used for something something initial connection
					muc: "muc.meet.jitsi", // session coordinator. If this is wrong, the connection fails with Strophe: BOSH-Connection failed: improper-addressing
					focus: "focus.meet.jitsi", // video stream coordinator. If this is wrong, you won't see any video and get "Focus error"s on the console. 
				},
			}
		}
	}

	constructor(options: JitsiMeetOptions) {
		this.options = options;

		// Initialize
		JitsiMeetJS.init({});
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
	 * Join a new conference or leave the current conference and join another. 
	 * Seemingly only one conference is supported per connection by JitsiMeetJS. 
	 * @param name The name of the conference to join. Can be any string. Example: ParallelPerceptionsDefineReasonably. Automatically transformed to lower case. 
	 * @param listeners Listeners for events on the conference to add before the conference is joined. If this parameter is not provided, there will be an attempt to use eventListeners from the previous run. 
	 * @returns true if a new conference was joined, false if the method was aborted due to already being in that conference. 
	 */
	public async joinConference(name: string, listeners?: Map<JitsiConferenceEvents, Function>): Promise<boolean> {
		// TODO: Cancel other already running joinConference()s
		if(!this.connection) { console.info("joinConference has been called without an existing connection, doing nothing"); return; }

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
		return new Promise<boolean>(async (resolve, reject) => {
			if (!this.conference?.isJoined()) {
				console.debug("No conference joined to leave");
				resolve(false);
				return;
			}

			this.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_LEFT, () => resolve(true));

			this.conference.leave();
			this.conference = null;

			// This is against a bug in JitsiMeetJS causing a memory leak (Possible EventEmitter memory leak detected. 11 xmpp.speaker_stats_received listeners added)
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