# lib-jitsi-meet-demo

High level abstraction and demo application in Typescript for [(@solyd/)lib-jitsi-meet/JitsiMeetJS](https://github.com/solydhq/lib-jitsi-meet).

lib-jitsi-meet (also known as JitsiMeetJS) is a powerful library, but I found it non-trivial to start with, so I made a high level abstraction and demo application in Typescript to make it easier to get started with. 

The code is quite thoroughly commented, so go have a look!

## Running

`npm install` installs the packages the project depends on (most notably [@solyd/lib-jitsi-meet](https://github.com/solydhq/lib-jitsi-meet))

`npm start` starts a webpack dev server on [https://localhost:9000/](https://localhost:9000/). 

`npm build` creates a shippable bundle.js in the dist/ folder

## Demo

A demo using the public meet.jit.si instance is available at https://solarkraft.github.io/lib-jitsi-meet-demo/. It connects to the Jitsi Meet conference `TalentedBlocksGetThis`, which is accessible using the official Jitsi Meet client at https://meet.jit.si/TalentedBlocksGetThis. Because of meet.jit.si's limitations, switching conferences is disabled in this configuration.

## Explanation

The `JitsiMeet` class contains a high level abstraction for the basic functionality of lib-jitsi-meet. `main.ts` manages the UI and instruments its `JitsiMeet` instance. 

The `JitsiMeet` class has the properties `connection` and `conference`, which provide access to their respective JitsiMeetJS objects. 

A `JitsiMeet` object is instantiated with `JitsiMeetOptions`, which has a field for `ConnectionOptions`. 

## ConnectionOptions

The main thing you'll need to change and the main thing I found challenging to understand. Inspired by https://meet.jit.si/config.js. Templates are provided for meet.jit.si and docker based setups (PRs for more standard setup are welcome!). 

There are few things that need to be changed when using a template. 

### Template example

Copy the docker template

```
let config = JitsiMeet.CONFIG_DOCKER;
```

Set the serviceUrl. This is your main address and either looks like `wss://localhost:8443/xmpp-websocket` (WebSocket) or `https://localhost:8443/http-bind` (BOSH, deprecated)

```
config.connectionOptions.serviceUrl = "wss://localhost:8443/xmpp-websocket";
```

### Full explanation
```
/** The main address of your server. Can either be a WebSockets (wss://.../xmpp-websocket) or BOSH (.../http-bind) URL. 
    *  WebSocket is generally preferable. The properties `bosh` and `websocket` are deprecated in favor of `serviceUrl`. 
    *  The server needs to be configured to allow CORS with the domain your app runs on. The meet.jit.si instance has it enabled
    *  for BOSH, on a docker instance you can enable it by setting the environment variable `XMPP_CROSS_DOMAIN=true` (see `.env`). */
serviceUrl?: string,
hosts: {
    /** Base domain. Only required on the public instance. Causes focus errors if set wrongly. */
    domain?: string,
    /** Internal domain of the "Multi user chat" (XMPP room/Session coordination). If this is wrong, the connection fails 
        *  silently when using the WebSocket or with `Strophe: BOSH-Connection failed: improper-addressing`
        *  when using BOSH. Defaults: `muc.meet.jitsi` (docker) or `conference.meet.jit.si` (official instance).
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
/** If your Jitsi Meet instance does additional routing of users (load halancing) based on the requested room
    *  name passed in the serviceUrl `?room=...` query parameter (meet.jit.si), you need to specify the room
    *  name here before connecting. If there is a mismatch, you get a nice secret room only those 
    *  in the know will be able to connect to.  */
roomName?: string;
/** May be necessary to prevent a type error when it is attempted to be modified. Only seen used on meet.jit.si */
deploymentInfo?: {}
[key: string]: any; // Allow any more options to be passed since there's a lot more that can be configured
```

### Docker template

`JitsiMeet.CONFIG_DOCKER`

Configuration for a docker installation (https://github.com/jitsi/docker-jitsi-meet) running on localhost with default values

```
logLevel: JitsiLogLevels.WARN,
connectionOptions: {
    // serviceUrl: "https://localhost:8443/http-bind", // BOSH
    serviceUrl: "wss://localhost:8443/xmpp-websocket", // WebSocket
    hosts: {
        anonymousdomain: "meet.jitsi", // Internal domain. meet.jitsi by default (docker). may be used to infer others. 
        muc: "muc.meet.jitsi", // Session coordinator. If this is wrong, the connection fails with Strophe: BOSH-Connection failed: improper-addressing
        focus: "focus.meet.jitsi", // Video stream coordinator. If this is wrong, you won't see any video and get "Focus error"s on the console. 
    },
}
```

### meet.jit.si template

`JitsiMeet.MEET_JIT_SI`

Configuration for the public meet.jit.si instance. It only works via BOSH because the WebSockets connections are CORS-restricted. 

```
logLevel: JitsiLogLevels.WARN,
connectionOptions: {
    roomName: "",
    hosts: {
        domain: "meet.jit.si",
        muc: "conference.meet.jit.si",
    },
    // The public Jitsi Meet instance seems to do extra routing on connection based on the room name, 
    // hence it must be provided before connecting and the room can't be switched later.  
    get serviceUrl() { return "https://meet.jit.si/http-bind?room=" + this.roomName.toLowerCase(); },
    deploymentInfo: {}, // Gets rid of an error when Strophe tries to add properties (only seen on meet.jit.si)
```