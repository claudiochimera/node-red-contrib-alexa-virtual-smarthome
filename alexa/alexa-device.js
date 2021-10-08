/**
 * NodeRED Alexa SmartHome
 * Copyright (C) 2021 Claudio Chimera.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 **/

// https://developer.amazon.com/en-US/docs/alexa/smarthome/understand-the-smart-home-skill-api.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/smart-home-general-apis.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-powercontroller.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-discovery.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
// https://developer.amazon.com/en-US/docs/alexa/smarthome/state-reporting-for-a-smart-home-skill.html
// https://developer.amazon.com/en-US/docs/alexa/smarthome/get-started-with-device-templates.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-property-schemas.html

const float_values = {
    color: {
        saturation: true,
        brightness: true
    }
};

module.exports = function (RED) {
    /******************************************************************************************************************
     *
     *
     */
    class AlexaDeviceNode {
        constructor(config) {
            RED.nodes.createNode(this, config);
            var node = this;
            node.config = config;
            node.YES = RED._("alexa-device.label.YES");
            node.NO = RED._("alexa-device.label.NO");
            node.state = {};

            node.alexa = RED.nodes.getNode(node.config.alexa);

            if (!node.config.alexa) {
                node.error(RED._("alexa-device.error.missing-config"));
                node.status({ fill: "red", shape: "dot", text: RED._("alexa-device.error.missing-config") });
                return;
            } else if (typeof node.alexa.register !== 'function') {
                node.error(RED._("alexa-device.error.missing-bridge"));
                node.status({ fill: "red", shape: "dot", text: RED._("alexa-device.error.missing-bridge") });
                return;
            }
            if (node.isVerbose()) node._debug("config " + JSON.stringify(config));
            if (node.isVerbose()) node._debug("display_categories " + JSON.stringify(node.config.display_categories));
            let names = node.config.display_categories.map(dt => RED._("alexa-device.display_category." + dt));
            node.device_desc = names.join();

            node.setupCapabilities();
            node.alexa.register(node);

            node.on('input', function (msg) {
                node.onInput(msg);
            });

            node.on('close', function (removed, done) {
                if (node.isVerbose()) node._debug("(on-close) " + node.config.name);
                node.onClose(removed, done);
            });
        }

        //
        //
        //
        //
        isVerbose() {
            return this.config.alexa && this.alexa.config.verbose;
        }

        //
        //
        //
        //
        _debug(msg) {
            console.log('AlexaDeviceNode:' + msg); // TODO REMOVE
            this.debug('AlexaDeviceNode:' + msg);
        }

        //
        //
        //
        //
        onClose(removed, done) {
            var node = this;
            node.alexa.deregister(node, removed);
            // TODO if removed, send remove event?

            if (typeof done === 'function') {
                done();
            }
        }

        //
        //
        //
        //
        onInput(msg) {
            var node = this;
            const topicArr = String(msg.topic || '').split('/');
            const topic = topicArr[topicArr.length - 1].toUpperCase();
            if (node.isVerbose()) node._debug("onInput " + topic);
            if (topic === 'REPORTSTATE') {
                node.alexa.send_change_report(node.id);
            } else if (topic === 'GETSTATE') {
                node.send({
                    topic: "getState",
                    payload: node.state
                })
                // node.sendState([], {}, undefined, "getState");
            } else if (topic === 'GETALLSTATES') {
                let states = node.alexa.get_all_states();
                node.send({
                    topic: "getAllStates",
                    payload: states
                })
            } else if (topic === 'GETNAMES') {
                let names = node.alexa.get_all_names();
                node.send({
                    topic: "getNames",
                    payload: names
                })
            } else if (topic === 'DOORBELLPRESS') {
                // TODO https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-doorbelleventsource.html
                // https://developer.amazon.com/en-US/docs/alexa/smarthome/state-reporting-for-a-smart-home-skill.html#cause-object
                // cause APP_INTERACTION PERIODIC_POLL PHYSICAL_INTERACTION RULE_TRIGGER VOICE_INTERACTION 
                // timestamp
                if (node.isVerbose()) node._debug("CCHI " + node.id + "  " + topicArr[topicArr.length - 1] + " " + msg.payload || '');
                process.nextTick(() => {
                    node.alexa.send_doorbell_press(node.id, msg.payload || '');
                });
            } else if (topic === 'CAMERASTREAMS') {
                node.cameraStreams = msg.payload;
                if (node.isVerbose()) node._debug("CCHI cameraStreams " + node.id + " " + JSON.stringify(node.cameraStreams));
            } else if (topic === 'SETMEDIA') {
                const media_to_set = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
                const media_id_to_set = media_to_set.map(m => m.id);
                const current_media_id = node.media.map(m => m.id);
                const media_id_to_remove = current_media_id.filter(id => !media_id_to_set.includes(id));
                node.media = media_to_set;
                const media_id_to_add = node.media.map(m => m.id);
                if (node.media) node.alexa.send_media_created_or_updated(node.id, node.media);
                if (media_id_to_remove.length > 0) node.alexa.send_media_deleted(node.id, media_id_to_remove);
            } else if (topic === 'ADDORUPDATEMEDIA') {
                const media_to_add = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
                const media_id_to_add = media_to_add.map(m => m.id);
                const existing_media_to_update = node.media.filter(m => media_id_to_add.includes(m.id));
                const existing_media_id_to_update = existing_media_to_update.map(m => m.id);
                node.media = node.media.filter(m => !existing_media_id_to_update.includes(m.id)); // Remove old media to update
                media_to_add.forEach(m => node.media.push(m));
                if (media_to_add) node.alexa.send_media_created_or_updated(node.id, media_to_add);
            } else if (topic === 'REMOVEMEDIA') {
                const media_id_to_remove = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
                const media_to_remove = node.media.filter(m => media_id_to_remove.includes(m.id));
                node.media = node.media.filter(m => !media_id_to_remove.includes(m.id));
                const media_id_removed = media_to_remove.map(m => m.id);
                if (media_id_removed.length > 0) node.alexa.send_media_deleted(node.id, media_id_removed);
            } else if (topic === 'EXECCOMMAND') { // test
                if (node.isVerbose()) {
                    node._debug(" CCHI command " + msg.namespace + " " + msg.name + " " + JSON.stringify(msg.payload));
                    let event_payload = {};
                    let modified = node.execCommand(msg.namespace, msg.name, msg.payload, event_payload)
                    node._debug("CCHI modified " + node.id + " modified " + JSON.stringify(modified));
                    node._debug("CCHI event_payload " + node.id + " event_payload " + JSON.stringify(event_payload));
                }
            } else {
                if (node.isVerbose()) node._debug("CCHI Before " + node.id + " state " + JSON.stringify(node.state));
                const modified = node.setValues(msg.payload, node.state);
                if (node.isVerbose()) node._debug("CCHI " + node.id + " modified " + JSON.stringify(modified));
                if (node.isVerbose()) node._debug("CCHI After " + node.id + " state " + JSON.stringify(node.state));
                if (modified.length > 0) {
                    process.nextTick(() => {
                        node.alexa.send_change_report(node.id, modified);
                    });
                }
                // node.sendState(modified, msg.payload);
            }
        }

        setupCapabilities() {
            var node = this;
            node.capabilities = [];
            node.endpoint = node.getEndpoint();

            // https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html

            // AutomationManagement
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-automationmanagement.html

            // BrightnessController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-brightnesscontroller.html
            if (node.config.i_brightness_controller) {
                if (node.isVerbose()) node._debug("Alexa.BrightnessController");
                node.addCapability("Alexa.BrightnessController", {
                    brightness: 50
                });
            }
            // CameraStreamController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-camerastreamcontroller.html
            if (node.config.i_camera_stream_controller) {
                if (node.isVerbose()) node._debug("Alexa.CameraStreamController");
                node.cameraStreams = [];
                let camera_stream_configurations = [];
                node.config.camera_stream_configurations.forEach(c => {
                    let r = [];
                    c.r.forEach(wh => {
                        r.push({
                            width: wh[0],
                            height: wh[1]
                        });
                    });
                    camera_stream_configurations.push({
                        protocols: c.p,
                        resolutions: r,
                        authorizationTypes: c.t,
                        videoCodecs: c.v,
                        audioCodecs: c.a
                    });
                });
                node.addCapability("Alexa.CameraStreamController", undefined,
                    {
                        cameraStreamConfigurations: camera_stream_configurations
                    });
            }

            // ChannelController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-channelcontroller.html
            if (node.config.i_channel_controller) {
                if (node.isVerbose()) node._debug("Alexa.ChannelController");
                node.addCapability("Alexa.ChannelController", {
                    channel: {
                        number: "",
                        callSign: "",
                        affiliateCallSign: ""
                    }
                });
            }
            // ColorController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-colorcontroller.html
            if (node.config.i_color_controller) {
                if (node.isVerbose()) node._debug("Alexa.ColorController");
                node.addCapability("Alexa.ColorController", {
                    color: {
                        "hue": 350.5,
                        "saturation": 0.7138,
                        "brightness": 0.6524
                    }
                });
            }

            // ColorTemperatureController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-colortemperaturecontroller.html
            if (node.config.i_color_temperature_controller) {
                if (node.isVerbose()) node._debug("Alexa.ColorTemperatureController");
                node.addCapability("Alexa.ColorTemperatureController", {
                    colorTemperatureInKelvin: 5500
                });
            }

            // ContactSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-contactsensor.html
            if (node.config.i_contact_sensor) {
                if (node.isVerbose()) node._debug("Alexa.ContactSensor");
                node.addCapability("Alexa.ContactSensor", {
                    detectionState: 'NOT_DETECTED'
                });
            }

            // DoorbellEventSource
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-doorbelleventsource.html
            if (node.config.i_doorbell_event_source) {
                if (node.isVerbose()) node._debug("Alexa.DoorbellEventSource");
                let capability = node.addCapability("Alexa.DoorbellEventSource");
                capability['proactivelyReported'] = true;
            }

            // EndpointHealth
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-endpointhealth.html
            if (node.config.i_endpoint_health) {
                if (node.isVerbose()) node._debug("Alexa.EndpointHealth");
                node.addCapability("Alexa.EndpointHealth", {
                    connectivity: 'OK' // UNREACHABLE
                });
            }

            // EqualizerController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-equalizercontroller.html

            if (node.config.i_equalizer_controller) {
                if (node.isVerbose()) node._debug("Alexa.EqualizerController");
                let properties = {};
                let configurations = {};
                if (node.config.bands.length > 0) {
                    let bands_supported = [];
                    let bands_value = [];
                    node.config.bands.forEach(band => {
                        bands_supported.push({
                            name: band
                        });
                        bands_value.push({
                            name: band,
                            value: 0
                        });
                    });
                    properties['bands'] = bands_value;
                    configurations['bands'] = {
                        supported: bands_supported,
                        range: {
                            minimum: node.to_int(node.config.band_range_min, -6),
                            maximum: node.to_int(node.config.band_range_max, 6)
                        }
                    }
                }
                if (node.config.modes.length > 0) {
                    properties['mode'] = node.config.modes[0];
                    let modes_supported = [];
                    node.config.modes.forEach(mode => {
                        modes_supported.push({
                            name: mode
                        });
                    });
                    configurations['modes'] = {
                        supported: modes_supported
                    }

                }
                node.addCapability("Alexa.EqualizerController", properties,
                    {
                        configurations: configurations
                    });
            }

            // Estimation
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-deviceusage-estimation.html
            if (node.config.i_estimation) {
                if (node.isVerbose()) node._debug("Alexa.DeviceUsage.Estimation");
                let powerProfile = {};
                if (node.config.i_color_controller || node.config.i_color_temperature_controller) {
                    powerProfile['type'] = 'BRIGHTNESS_COLOR';
                } else if (node.config.i_brightness_controller) {
                    powerProfile['type'] = 'BRIGHTNESS';
                } else if (node.config.i_power_controller) {
                    powerProfile['type'] = 'POWER';
                }
                if (powerProfile['type']) {
                    powerProfile['standbyWattage'] = {
                        "value": this.to_float(node.config.standby_wattage, .1),
                        "units": "WATTS"
                    };
                    if (powerProfile['type'] === 'POWER') {
                        powerProfile['onWattage'] = {
                            "value": this.to_float(node.config.maximum_wattage, 10),
                            "units": "WATTS"
                        };
                    } else {
                        powerProfile['maximumWattage'] = {
                            "value": this.to_float(node.config.maximum_wattage, 9),
                            "units": "WATTS"
                        };
                    }
                    node.addCapability("Alexa.DeviceUsage.Estimation", undefined,
                        {
                            configurations: {
                                powerProfile: powerProfile
                            }
                        });
                }
            }
            // EventDetectionSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-eventdetectionsensor.html

            if (node.config.i_event_detection_sensor) {
                if (node.isVerbose()) node._debug("Alexa.EventDetectionSensor");
                node.addCapability("Alexa.EventDetectionSensor", {
                    humanPresenceDetectionState: 'NOT_DETECTED' // DETECTED
                },
                    {
                        configuration: {
                            detectionMethods: [
                                "AUDIO",
                                "VIDEO"
                            ],
                            detectionModes: {
                                humanPresence: {
                                    featureAvailability: "ENABLED",
                                    supportsNotDetected: true
                                }
                            }
                        }
                    });
            }

            // InputController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-inputcontroller.html
            if (node.config.i_input_controller) {
                if (node.isVerbose()) node._debug("Alexa.InputController");
                let inputs = [];
                node.config.a_inputs.forEach(input => {
                    inputs.push({
                        name: input
                    })
                })
                node.addCapability("Alexa.InputController",
                    {
                        input: ''
                    },
                    {
                        inputs: inputs
                    }
                );
            }
            // InventoryLevelSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-inventorylevelsensor.html

            // InventoryUsageSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-inventoryusagesensor.html

            // KeypadController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-keypadcontroller.html
            if (node.config.i_keypad_controller) {
                if (node.isVerbose()) node._debug("Alexa.KeypadController");
                node.addCapability("Alexa.KeypadController", {}, {
                    keys: node.config.a_kc_keys
                });
            }

            // LockController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-lockcontroller.html
            if (node.config.i_lock_controller) {
                if (node.isVerbose()) node._debug("Alexa.LockController");
                node.addCapability("Alexa.LockController", {
                    lockState: 'LOCKED' // UNLOCKED JAMMED
                });
            }

            // MediaMetadata
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-mediametadata.html
            if (node.config.i_media_metadata) {
                if (node.isVerbose()) node._debug("Alexa.MediaMetadata");
                node.media = [];
                node.addCapability("Alexa.MediaMetadata");
            }

            // Meter
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-deviceusage-meter.html

            // ModeController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-modecontroller.html

            // MotionSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-motionsensor.html
            if (node.config.i_motion_sensor) {
                if (node.isVerbose()) node._debug("Alexa.MotionSensor");
                node.addCapability("Alexa.MotionSensor", {
                    detectionState: 'NOT_DETECTED' // DETECTED
                });
            }
            // PercentageController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-percentagecontroller.html
            if (node.config.i_percentage_controller) {
                if (node.isVerbose()) node._debug("Alexa.PercentageController");
                node.addCapability("Alexa.PercentageController", {
                    percentage: 0
                });
            }
            // PlaybackController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-playbackcontroller.html
            if (node.config.i_playback_controller) {
                if (node.isVerbose()) node._debug("Alexa.PlaybackController");
                node.addCapability("Alexa.PlaybackController", undefined, {
                    supportedOperations: node.config.a_playback_modes
                });
            }
            // PowerController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-powercontroller.html
            if (node.config.i_power_controller) {
                if (node.isVerbose()) node._debug("Alexa.PowerController");
                node.addCapability("Alexa.PowerController", {
                    powerState: 'OFF'
                });
            }
            // PowerLevelController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-powerlevelcontroller.html
            if (node.config.i_power_level_controller) {
                if (node.isVerbose()) node._debug("Alexa.PowerLevelController");
                node.addCapability("Alexa.PowerLevelController", {
                    powerLevel: 50
                });
            }

            // RangeController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-rangecontroller.html

            // RTCSessionController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-rtcsessioncontroller.html

            // SceneController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-scenecontroller.html

            // SecurityPanelController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-securitypanelcontroller.html
            if (node.config.i_security_panel_controller) {
                if (node.isVerbose()) node._debug("Alexa.SecurityPanelController");
                const arm_state = node.config.arm_state || [];
                const alarms = node.config.alarms || [];
                const pin_code = node.config.pin_code || '';
                let configuration = {};
                if (arm_state.length > 0 || pin_code.trim().length === 4) {
                    let properties_value = {};
                    if (arm_state.length > 0) {
                        properties_value['armState'] = arm_state[0];
                        configuration['supportedArmStates'] = arm_state.map(state => ({ "value": state }));
                    }
                    alarms.forEach(alarm => {
                        properties_value[alarm] = {
                            value: "OK"
                        };
                    });
                    if (pin_code.trim().length === 4) {
                        configuration['supportedAuthorizationTypes'] = ['FOUR_DIGIT_PIN'];
                    }
                    node.addCapability("Alexa.SecurityPanelController", properties_value,
                        {
                            configuration: configuration
                        }
                    );
                }
            }

            // Speaker
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-speaker.html
            if (node.config.i_speaker) {
                if (node.isVerbose()) node._debug("Alexa.Speaker");
                node.addCapability("Alexa.Speaker", {
                    volume: 50,
                    muted: false
                });
            }

            // StepSpeaker
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-stepspeaker.html
            if (node.config.i_step_speaker) {
                if (node.isVerbose()) node._debug("Alexa.StepSpeaker");
                node.addCapability("Alexa.StepSpeaker");
            }

            // TemperatureSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-temperaturesensor.html
            if (node.config.i_temperature_sensor) {
                if (node.isVerbose()) node._debug("Alexa.TemperatureSensor");
                node.addCapability("Alexa.TemperatureSensor", {
                    temperature: {
                        "value": 19.9,
                        "scale": "CELSIUS" // FAHRENHEIT KELVIN
                    }
                });
            }

            // ThermostatController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-thermostatcontroller.html
            if (node.config.i_thermostat_controller) {
                if (node.isVerbose()) node._debug("Alexa.ThermostatController");
                let properties = {};
                if (node.config.a_target_setpoint) {
                    properties.targetSetpoint = {
                        "value": 20.1,
                        "scale": "CELSIUS"
                    };
                }
                if (node.config.a_lower_setpoint) {
                    properties.lowerSetpoint = {
                        "value": 20.1,
                        "scale": "CELSIUS"
                    };
                }
                if (node.config.a_upper_setpoint) {
                    properties.upperSetpoint = {
                        "value": 20.1,
                        "scale": "CELSIUS"
                    };
                }
                if (node.config.a_modes.length > 1) {
                    properties.thermostatMode = node.config.a_modes.includes('OFF') ? 'OFF' : node.config.a_modes[0];
                }
                node.addCapability("Alexa.ThermostatController",
                    properties,
                    {
                        configuration: {
                            supportedModes: node.config.a_modes,
                            supportsScheduling: node.config.a_supports_scheduling
                        }
                    }
                );
                /*delete node.state.thermostat_mode;
                node.state['schedule'] = {
                    start: "",
                    duration: ""
                };*/
            }
            // ThermostatController.HVAC.Components	
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-thermostatcontroller-hvac-components.html

            // ToggleController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-togglecontroller.html

            // WakeOnLANController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-wakeonlancontroller.html

            if (node.isVerbose()) node._debug("capabilities " + JSON.stringify(node.capabilities));
            if (node.isVerbose()) node._debug("properties " + JSON.stringify(node.getProperties()));
            if (node.isVerbose()) node._debug("states " + JSON.stringify(node.state));
        }

        getEndpoint() {
            var node = this;
            let endpoint = {
                "endpointId": node.config.id,
                "manufacturerName": "Node-RED",
                "description": node.device_desc + " " + node.config.name + " by Node-RED",
                "friendlyName": node.config.name,
                "displayCategories": node.config.display_categories,
                "additionalAttributes": {
                    "manufacturer": "Node-RED",
                    "model": node.device_desc,
                },
                "capabilities": node.capabilities,
                "connections": [],
                "relationships": {},
                "cookie": {}
            };
            return endpoint;
        }

        //
        //
        //
        //
        getCapability(iface, properties_val) {
            var node = this;
            let capability = {
                type: "AlexaInterface",
                interface: iface,
                version: "3",
            };
            if (properties_val) {
                let supported = [];
                Object.keys(properties_val).forEach(key => {
                    node.state[key] = properties_val[key];
                    supported.push({
                        name: key
                    });
                });
                capability['properties'] = {
                    supported: supported,
                    proactivelyReported: true,
                    retrievable: true
                };
            }
            return capability;
        }

        //
        //
        //
        //
        addCapability(iface, properties_val, attributes) {
            var node = this;
            let capability = node.getCapability(iface, properties_val);
            if (attributes !== undefined) {
                Object.assign(capability, attributes);
            }
            node.capabilities.push(capability);
            return capability;
        }

        //
        //
        //
        //
        // https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
        execCommand(namespace, name, payload, event_payload) { // Directive
            var node = this;
            let modified = undefined;
            if (node.isVerbose()) node._debug("execCommand state before " + name + "/" + namespace + " " + JSON.stringify(node.state));

            switch (namespace) {
                case "Alexa.BrightnessController": // BrightnessController
                    if (name === 'SetBrightness') {
                        modified = node.setValues(payload, node.state);
                    } else if (name === 'AdjustBrightness') {
                        const modified = node.setValues({
                            brightness: node.state['brightness'] + payload.brightnessDelta
                        }, node.state);
                    }
                    break;

                case "Alexa.CameraStreamController": // CameraStreamController
                    if (name === 'InitializeCameraStreams') {
                        modified = [];
                        const cameraStreams = payload.cameraStreams;
                        if (node.isVerbose()) node._debug("CCHI cameraStreams " + node.id + " " + JSON.stringify(node.cameraStreams));
                        if (node.isVerbose()) node._debug("CCHI payload " + node.id + " " + JSON.stringify(payload));
                        let css = [];
                        if (node.cameraStreams && node.cameraStreams.cameraStreams && node.cameraStreams.cameraStreams.length > 0) {
                            node.cameraStreams.cameraStreams.forEach(acs => {
                                cameraStreams.forEach(rcs => {
                                    if (acs.protocol === rcs.protocol &&
                                        acs.resolution.width === rcs.resolution.width &&
                                        acs.resolution.height === rcs.resolution.height &&
                                        acs.authorizationType === rcs.authorizationType &&
                                        acs.videoCodec === rcs.videoCodec &&
                                        acs.audioCodec === rcs.audioCodec
                                    ) {
                                        css.push({
                                            uri: acs.uri,
                                            expirationTime: acs.expirationTime,
                                            idleTimeoutSeconds: acs.idleTimeoutSeconds,
                                            protocol: acs.protocol,
                                            resolution: {
                                                width: acs.resolution.width,
                                                height: acs.resolution.height,
                                            },
                                            authorizationType: acs.authorizationType,
                                            videoCodec: acs.videoCodec,
                                            audioCodec: acs.audioCodec
                                        });
                                    }
                                });
                            });
                            if (css.length > 0) {
                                event_payload.cameraStreams = css;
                                event_payload.imageUri = node.cameraStreams.imageUri || '';
                            }
                        }
                    }
                case "Alexa.ChannelController": // ChannelController
                    if (name === 'ChangeChannel') {
                        modified = node.setValues(payload, node.state);
                    }
                    else if (name === 'SkipChannels') {
                        const channelCount = payload.channelCount;
                        // TODO, search current channel, increase by channelCount, set it
                        const new_channel = {
                            number: "7",
                            callSign: "CBS",
                            affiliateCallSign: "KIRO"
                        };
                        modified = [];
                    }
                    break;

                case "Alexa.ColorController": // ColorController
                    if (name === 'SetColor') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.ColorTemperatureController": // ColorTemperatureController
                    if (name === 'SetColorTemperature') {
                        modified = node.setValues(payload, node.state);
                    }
                    else if (name === 'IncreaseColorTemperature') {
                        modified = node.setValues({
                            brightness: node.state['colorTemperatureInKelvin'] + 100
                        }, node.state);
                    }
                    else if (name === 'DecreaseColorTemperature') {
                        modified = node.setValues({
                            brightness: node.state['colorTemperatureInKelvin'] - 100
                        }, node.state);
                    }
                    break;

                case "Alexa.EqualizerController": // EqualizerController
                    if (name === 'SetMode') {
                        modified = node.setValues(payload, node.state);
                    } else if (name === 'SetBands') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.MediaMetadata": // MediaMetadata
                    if (name === 'GetMediaMetadata') {
                        if (node.isVerbose()) node._debug("execCommand node.media " + name + "/" + namespace + " " + JSON.stringify(node.media));
                        modified = []; // TODO
                        if (payload.filters && Array.isArray(payload.filters.mediaIds)) {
                            event_payload.media = [];
                            node.media.forEach(m => {
                                if (payload.filters.mediaIds.includes(m.id)) {
                                    event_payload.media.push(m);
                                }
                            });
                            const current_media_id = node.media.map(m => m.id);
                            event_payload.errors = [];
                            payload.filters.mediaIds.forEach(id => {
                                if (!current_media_id.includes(id)) {
                                    event_payload.errors.push({
                                        mediaId: id,
                                        status: "NOT_FOUND"
                                    });
                                }
                            });
                        } else {
                            event_payload.media = node.media;
                        }
                    }
                    break;

                case "Alexa.InputController": // InputController
                    if (name === 'SelectInput') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.KeypadController": // KeypadController
                    if (name === 'SendKeystroke') {
                        modified = [];
                    }
                    break;

                case "Alexa.LockController": // LockController
                    // TODO DeferredResponse
                    // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-response.html#deferred
                    if (name === 'Lock') {
                        modified = node.setValues({
                            lockState: 'LOCKED'
                        }, node.state);
                    }
                    else if (name === 'Unlock') {
                        modified = node.setValues({
                            lockState: 'UNLOCKED'
                        }, node.state);
                    }
                    break;

                case "Alexa.PercentageController": // PercentageController
                    if (name === 'SetPercentage') {
                        modified = node.setValues(payload, node.state);
                    } else if (name === 'AdjustPercentage') {
                        modified = node.setValues({
                            percentage: node.state['percentage'] - payload['percentageDelta']
                        }, node.state);
                    }
                    break;

                case "Alexa.PowerController": // PowerController
                    if (name === 'TurnOn') {
                        modified = node.setValues({
                            powerState: 'ON'
                        }, node.state);
                    }
                    else if (name === 'TurnOff') {
                        modified = node.setValues({
                            powerState: 'OFF'
                        }, node.state);
                    }
                    break;

                case "Alexa.PlaybackController": // PlaybackController
                    if (node.config.a_playback_modes.includes(name)) {
                        modified = []
                    }
                    break;


                case "Alexa.PowerLevelController": // PowerLevelController
                    if (name === 'AdjustPowerLevel') {
                        modified = []
                    }
                    break;

                case "Alexa.SceneController": // SceneController
                    if (name === 'Activate') {
                        modified = [];
                    }
                    else if (name === 'Deactivate') {
                        modified = [];
                    }
                    break;

                case "Alexa.SecurityPanelController": // SecurityPanelController
                    if (name === 'Arm') {
                        modified = node.setValues({ armState: payload['armState'] }, node.state);
                        // TODO ?? "bypassType": "BYPASS_ALL"
                        // exitDelayInSeconds
                        // bypassedEndpoints
                    }
                    else if (name === 'Disarm') {
                        if (payload.authorization && payload.authorization.type === 'FOUR_DIGIT_PIN' && payload.authorization.value === node.config.pin_code) {
                            modified = node.setValues({ armState: 'DISARMED' }, node.state);
                        }
                    }
                    break;

                case "Alexa.Speaker": // Speaker
                    if (name === 'SetVolume') {
                        modified = node.setValues(payload, node.state);
                    }
                    else if (name === 'AdjustVolume') {
                        modified = node.setValues({
                            volume: node.state['volume'] + payload['volume']
                        }, node.state);
                    }
                    else if (name === 'SetMute') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.StepSpeaker": // StepSpeaker
                    if (name === 'AdjustVolume') {
                        modified = [];
                    }
                    break;

                case "Alexa.ThermostatController": // ThermostatController
                    if (name === 'SetTargetTemperature') {
                        modified = node.setValues(payload, node.state);
                        /*
                        if (payload.targetSetpoint === undefined) {
                            delete node.state.targetSetpoint;
                        }
                        if (payload.lowerSetpoint === undefined) {
                            delete node.state.lowerSetpoint;
                        }
                        if (payload.upperSetpoint === undefined) {
                            delete node.state.upperSetpoint;
                        }
                        */
                    }
                    else if (name === 'AdjustTargetTemperature') {
                        modified = []
                        if (typeof payload.targetSetpoint.value === 'number' && typeof node.state.targetSetpoint.value === 'number') {
                            // TODO check scale
                            node.state.targetSetpoint.value += payload.targetSetpoint.value;
                            modified.push('targetSetpoint');
                        }
                        if (typeof payload.lowerSetpoint.value === 'number' && typeof node.state.lowerSetpoint.value === 'number') {
                            // TODO check scale
                            node.state.lowerSetpoint.value += payload.lowerSetpoint.value;
                            modified.push('lowerSetpoint');
                        }
                        if (typeof payload.upperSetpoint.value === 'number' && typeof node.state.upperSetpoint.value === 'number') {
                            // TODO check scale
                            node.state.upperSetpoint.value += payload.upperSetpoint.value;
                            modified.push('upperSetpoint');
                        }
                    }
                    else if (name === 'SetThermostatMode') {
                        modified = node.setValues({
                            thermostatMode: payload.thermostatMode.value
                        }, node.state);
                    }
                    else if (name === 'ResumeSchedule') {
                        modified = []
                    }
                    break;

                default:
                    node.error("execCommand invalid directive " + name + "/" + namespace);
            }


            if (modified !== undefined) {
                node.sendState(modified, payload, namespace, name);
            }

            if (node.isVerbose()) node._debug("execCommand event_payload " + name + "/" + namespace + " " + JSON.stringify(event_payload));
            if (node.isVerbose()) node._debug("execCommand modified after " + name + "/" + namespace + " " + JSON.stringify(modified));
            if (node.isVerbose()) node._debug("execCommand state after " + name + "/" + namespace + " " + JSON.stringify(node.state));
            return modified;
        }

        //
        //
        //
        //
        sendState(modified, inputs, namespace, name) {
            var node = this;
            if (modified === undefined) {
                modified = [];
            }
            if (inputs === undefined) {
                inputs = {};
            }
            let msg = {
                inputs: inputs,
                payload: node.state,
                modified: modified,
                topic: node.config.topic,
                device: node.config.name
            };
            if (name) {
                msg.name = name;
            }
            if (namespace) {
                msg.namespace = namespace;
            }
            node.send(msg);
            return node.state;
        }

        //
        //
        //
        //
        // https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
        getProperties() {
            var node = this;
            const uncertainty = 0;
            let properties = [];
            const time_of_sample = (new Date()).toISOString();
            // BrightnessController
            if (node.config.i_brightness_controller) {
                properties.push({
                    namespace: "Alexa.BrightnessController",
                    name: "brightness",
                    value: node.state['brightness'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // ColorTemperatureController
            if (node.config.i_color_temperature_controller) {
                if (node.state['colorTemperatureInKelvin'] !== undefined) {
                    properties.push({
                        namespace: "Alexa.ColorTemperatureController",
                        name: "colorTemperatureInKelvin",
                        value: node.state['colorTemperatureInKelvin'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            // ColorController
            if (node.config.i_color_controller) {
                if (node.state['color'] !== undefined) {
                    properties.push({
                        namespace: "Alexa.ColorController",
                        name: "color",
                        value: node.state['color'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            // EndpointHealth
            if (node.config.i_endpoint_health) {
                properties.push({
                    namespace: "Alexa.EndpointHealth",
                    name: "connectivity",
                    value: node.state['connectivity'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // EqualizerController
            if (node.config.i_equalizer_controller) {
                if (typeof node.state['bands'] === 'object') {
                    properties.push({
                        namespace: "Alexa.EqualizerController",
                        name: "bands",
                        value: node.state['bands'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (typeof node.state['mode'] === 'string') {
                    properties.push({
                        namespace: "Alexa.EqualizerController",
                        name: "mode",
                        value: node.state['mode'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            // MotionSensor
            if (node.config.i_motion_sensor) {
                properties.push({
                    namespace: "Alexa.MotionSensor",
                    name: "detectionState",
                    value: node.state['detectionState'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // PercentageController
            if (node.config.i_percentage_controller) {
                properties.push({
                    namespace: "Alexa.PercentageController",
                    name: "percentage",
                    value: node.state['percentage'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // SecurityPanelController
            if (node.config.i_security_panel_controller) {
                if (node.state['armState']) {
                    properties.push({
                        namespace: "Alexa.SecurityPanelController",
                        name: "armState",
                        value: node.state['armState'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                node.config.alarms.forEach(alarm => {
                    properties.push({
                        namespace: "Alexa.SecurityPanelController",
                        name: alarm,
                        value: node.state[alarm],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                });
            }
            // PowerController
            if (node.config.i_power_controller) {
                properties.push({
                    namespace: "Alexa.PowerController",
                    name: "powerState",
                    value: node.state['powerState'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // TemperatureSensor
            if (node.config.i_temperature_sensor) {
                properties.push({
                    namespace: "Alexa.TemperatureSensor",
                    name: "temperature",
                    value: node.state['temperature'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // ThermostatController
            if (node.config.i_thermostat_controller) {
                if (node.state.targetSetpoint !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "targetSetpoint",
                        value: node.state['targetSetpoint'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (node.state.lowerSetpoint !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "lowerSetpoint",
                        value: node.state['lowerSetpoint'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (node.state.upperSetpoint !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "upperSetpoint",
                        value: node.state['upperSetpoint'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (node.state.thermostatMode !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "thermostatMode",
                        value: node.state['thermostatMode'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            return properties;
        }

        //
        //
        //
        //
        /*setState(from_object, to_object) {
            var node = this;
            let new_value;
            let modified;
            // Thermostat
            if (node.config.i_thermostat_controller) {
                new_value = {
                    targetSetpoint: {
                        value: -274.1,
                        scale: "CELSIUS"
                    },
                    lowerSetpoint: {
                        value: -274.1,
                        scale: "CELSIUS"
                    },
                    upperSetpoint: {
                        value: -274.1,
                        scale: "CELSIUS"
                    },
                };
                modified = node.setValues(from_object, new_value);
                if (modified.includes('targetSetpoint')) {
                    delete to_object.lowerSetpoint;
                    delete to_object.upperSetpoint;
                    if (typeof to_object.targetSetpoint === 'undefined') {
                        to_object.targetSetpoint = {
                            value: -274.1,
                            scale: "CELSIUS"
                        };
                    }
                } else {
                    if (modified.includes('lowerSetpoint')) {
                        delete to_object.targetSetpoint;
                        if (typeof to_object.lowerSetpoint === 'undefined') {
                            to_object.lowerSetpoint = {
                                value: -274.1,
                                scale: "CELSIUS"
                            };
                        }
                    }   
                    if (modified.includes('upperSetpoint')) {
                        delete to_object.targetSetpoint;
                        if (typeof to_object.upperSetpoint === 'undefined') {
                            to_object.upperSetpoint = {
                                value: -274.1,
                                scale: "CELSIUS"
                            };
                        }
                    }   
                }
            }
            let differs = node.setValues(from_object, to_object);
            return differs;
        }*/

        //
        //
        //
        //
        setValues(from_object, to_object) {
            var node = this;
            let differs = [];
            Object.keys(to_object).forEach(function (key) {
                if (from_object.hasOwnProperty(key)) {
                    if (node.setValue(key, from_object[key], to_object, float_values[key] || {})) {
                        differs.push(key);
                    }
                }
            });
            return differs;
        }

        //
        //
        //
        //
        setValue(key, value, to_object, float_values) {
            var node = this;
            let differs = false;
            const old_value = to_object[key];
            const val_type = typeof old_value;
            let new_value = undefined;
            if (val_type === 'number') {
                if (float_values) {
                    new_value = parseFloat(String(value));
                    if (isNaN(new_value)) {
                        throw new Error('Unable to convert "' + value + '" to a float');
                    }
                } else {
                    new_value = parseInt(String(value));
                    if (isNaN(new_value)) {
                        throw new Error('Unable to convert "' + value + '" to a float');
                    }
                }
            } else if (val_type === 'string') {
                new_value = String(value);
            } else if (val_type === 'boolean') {
                switch (String(value).toUpperCase()) {
                    case "TRUE":
                    case "ON":
                    case "YES":
                    case node.YES:
                    case "1":
                        new_value = true;
                        break;
                    case "FALSE":
                    case "OFF":
                    case "NO":
                    case node.NO:
                    case "0":
                        new_value = false;
                        break;
                    default:
                        throw new Error('Unable to convert "' + value + '" to a boolean');
                }
            } else if (val_type === 'object') {
                if (typeof value === "object") {
                    if (Array.isArray(old_value)) {
                        if (Array.isArray(value)) {
                            if (JSON.stringify(to_object[key]) != JSON.stringify(value)) {
                                differs = true;
                            }
                            to_object[key] = value;
                        } else {
                            throw new Error('key "' + key + '" must be an array.');
                        }
                    } else {
                        if (Array.isArray(value)) {
                            throw new Error('key "' + key + '" must be an object.');
                        }
                        Object.keys(old_value).forEach(function (key) {
                            if (typeof value[key] !== 'undefined') {
                                if (node.setValue(key, value[key], old_value, float_values[key] || {})) {
                                    differs = true;
                                }
                            }
                        });
                    }
                } else {
                    if (Array.isArray(old_value)) {
                        throw new Error('key "' + key + '" must be an array.');
                    }
                    throw new Error('key "' + key + '" must be an object.');
                }
            }
            if (val_type !== 'object') {
                if (new_value !== undefined) {
                    differs = old_value !== new_value;
                    to_object[key] = new_value;
                }
            }
            return differs;
        }
        //
        //
        //
        //
        to_int(value, default_value) {
            const n = parseInt(value);
            const f = parseFloat(value);
            if (!isNaN(value) && Number.isInteger(f)) {
                return n;
            }
            return default_value;
        }
        //
        //
        //
        //
        to_float(value, default_value) {
            if (isNaN(value)) {
                return default_value;
            }
            return parseFloat(value);
        }
    }
    RED.nodes.registerType("alexa-device", AlexaDeviceNode);
}
