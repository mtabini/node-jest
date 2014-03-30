'use strict';

module.exports = {

  id: '/boards/@schema',
  $schema: 'http://json-schema.org/draft-04/schema#',

  title: 'Board',
  description: 'An entity that represents a Telemetry dashboard',

  oneOf: [
    {
      type: 'object',

      required: ['description', 'type'],

      additionalProperties: false,

      properties: {
        description: {
          type: 'string',
          description: 'A description of the argument\'s purpose'
        },

        type: {
          type: 'string',
          description: 'The type (or types) of the argument'
        },

        required: {
          type: 'boolean',
          description: 'Whether the parameter is required or not'
        }
      }
    },
    {
      type: 'array',

      items: { 
        anyOf: [ 
          {
            type: 'object',

            required: ['name', 'description', 'type'],

            additionalProperties: false,

            properties: {
              name: {
                type: 'string',
                description: 'The name of this argument'
              },

              description: {
                type: 'string',
                description: 'A description of the argument\'s purpose'
              },

              type: {
                type: 'string',
                description: 'The type (or types) of the argument'
              },

              required: {
                type: 'boolean',
                description: 'Whether the parameter is required or not'
              }
            }
          }
        ] 
      }
    }
  ]
};