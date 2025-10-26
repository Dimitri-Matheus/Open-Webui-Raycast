/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Host Address - Enter the address of the Open WebUI server. This is where the connection will be made. */
  "webuiHost": string,
  /** Port Number - Specify the port number for the WebUI. Adjust according to your server configuration. */
  "webuiPort": string,
  /** Ollama Host - Enter the address of the server where the Ollama API is running. This allows the system to connect to the API forperforming operations. */
  "ollamaApiHost": string,
  /** Ollama Port - Provide the port number on which the Ollama API is listening. Ensure this matches the configuration of your APIserver. */
  "ollamaApiPort": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `server` command */
  export type Server = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `server` command */
  export type Server = {}
}

