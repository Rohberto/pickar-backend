const swaggerJsdoc = require('swagger-jsdoc');

// ── Reusable inline response helpers ─────────────────────────────────────────
const ok = (description, dataSchema) => ({
  200: {
    description,
    content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: dataSchema } } } },
  },
  400: { description: 'Bad request',    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  401: { description: 'Unauthorised',   content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  500: { description: 'Server error',   content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
});

const created = (description, dataSchema) => ({
  201: {
    description,
    content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: dataSchema } } } },
  },
  400: { description: 'Bad request',  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
});

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Pickar API',
      version: '1.0.0',
      description: "Backend API documentation for Pickar — Nigeria's on-demand package delivery platform.",
    },
    servers: [
      { url: process.env.API_URL || 'http://localhost:5000', description: 'Development' },
      { url: 'https://pickar-backend.onrender.com',         description: 'Production' },
    ],

    // ── Security schemes ───────────────────────────────────────────────────
    components: {
      securitySchemes: {
        userAuth:  { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT for sender / driver' },
        adminAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT for admin (contains adminId)' },
      },

      // ── Reusable schemas ──────────────────────────────────────────────────
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string',  example: 'Something went wrong' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total:      { type: 'integer', example: 100 },
            page:       { type: 'integer', example: 1 },
            limit:      { type: 'integer', example: 10 },
            totalPages: { type: 'integer', example: 10 },
          },
        },
        Address: {
          type: 'object',
          properties: {
            label:       { type: 'string', example: '12 Olagbaiye Street, Mushin, Lagos' },
            coordinates: { type: 'object', properties: { lat: { type: 'number', example: 6.5244 }, lng: { type: 'number', example: 3.3792 } } },
          },
        },
        User: {
          type: 'object',
          properties: {
            id:          { type: 'string',  example: '64f1a2b3c4d5e6f7a8b9c0d1' },
            fullName:    { type: 'string',  example: 'John Wilson' },
            email:       { type: 'string',  example: 'john@example.com' },
            phone:       { type: 'string',  example: '09074563789' },
            userType:    { type: 'string',  enum: ['sender', 'driver'] },
            isVerified:  { type: 'boolean', example: true },
            isApproved:  { type: 'boolean', example: true, description: 'Drivers only' },
            isSuspended: { type: 'boolean', example: false },
            photo:       { type: 'string',  example: 'https://res.cloudinary.com/pickar/image/upload/v1/photo.jpg' },
            escrowBalance: { type: 'number', example: 5000 },
            createdAt:   { type: 'string',  format: 'date-time' },
          },
        },
        Vehicle: {
          type: 'object',
          properties: {
            type:         { type: 'string', enum: ['bike', 'truck'] },
            plateNumber:  { type: 'string', example: 'JKH34NK' },
            model:        { type: 'string', example: 'Toyota Camry' },
            color:        { type: 'string', example: 'White' },
          },
        },
        Rating: {
          type: 'object',
          properties: {
            average: { type: 'number',  example: 4.98 },
            count:   { type: 'integer', example: 120 },
          },
        },
        Driver: {
          type: 'object',
          properties: {
            id:      { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d2' },
            name:    { type: 'string', example: 'John Wilson' },
            phone:   { type: 'string', example: '09074563789' },
            photo:   { type: 'string', example: 'https://res.cloudinary.com/pickar/image/upload/v1/photo.jpg' },
            status:  { type: 'string', enum: ['offline', 'online', 'busy'] },
            vehicle: { $ref: '#/components/schemas/Vehicle' },
            rating:  { $ref: '#/components/schemas/Rating' },
            location: {
              type: 'object',
              properties: {
                type:        { type: 'string',  example: 'Point' },
                coordinates: { type: 'array',   items: { type: 'number' }, example: [3.3792, 6.5244] },
              },
            },
          },
        },
        Recipient: {
          type: 'object',
          properties: {
            name:    { type: 'string', example: 'Kevin Gilbert' },
            phone:   { type: 'string', example: '09074563789' },
            address: { $ref: '#/components/schemas/Address' },
          },
        },
        Delivery: {
          type: 'object',
          properties: {
            id:          { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d3' },
            status:      { type: 'string', enum: ['pending', 'searching_driver', 'driver_assigned', 'driver_arrived', 'in_transit', 'delivered', 'cancelled'] },
            price:       { type: 'number',  example: 6000 },
            rideType:    { type: 'string',  enum: ['standard', 'eco_send', 'express', 'truck'] },
            packageType: { type: 'string',  enum: ['fragile', 'non_fragile'] },
            pickupAddress: { $ref: '#/components/schemas/Address' },
            recipient:     { $ref: '#/components/schemas/Recipient' },
            driver:        { $ref: '#/components/schemas/Driver' },
            pickupCode:    { type: 'string',  example: '9876' },
            deliveryCode:  { type: 'string',  example: '7689' },
            createdAt:     { type: 'string',  format: 'date-time' },
            updatedAt:     { type: 'string',  format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id:          { type: 'string' },
            type:        { type: 'string', enum: ['credit', 'debit'] },
            amount:      { type: 'number', example: 5000 },
            description: { type: 'string', example: 'Wallet top-up' },
            reference:   { type: 'string', example: 'PAY_abc123' },
            createdAt:   { type: 'string', format: 'date-time' },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            id:           { type: 'string' },
            balance:      { type: 'number',  example: 35000 },
            currency:     { type: 'string',  example: 'NGN' },
            transactions: { type: 'array',   items: { $ref: '#/components/schemas/Transaction' } },
          },
        },
        Admin: {
          type: 'object',
          properties: {
            id:        { type: 'string' },
            fullName:  { type: 'string',  example: 'Pickar Super Admin' },
            email:     { type: 'string',  example: 'admin@pickar.ng' },
            role:      { type: 'string',  enum: ['super_admin', 'support'] },
            isActive:  { type: 'boolean', example: true },
            lastLogin: { type: 'string',  format: 'date-time' },
            createdAt: { type: 'string',  format: 'date-time' },
          },
        },
        TrackingStep: {
          type: 'object',
          properties: {
            label:     { type: 'string',  example: 'Package picked up for delivery' },
            completed: { type: 'boolean', example: true },
            current:   { type: 'boolean', example: false },
          },
        },
      },
    },

    tags: [
      { name: 'Auth',              description: 'Signup, login, OTP, password reset' },
      { name: 'User',              description: 'Sender profile management' },
      { name: 'Driver',            description: 'Driver profile, location, status' },
      { name: 'Delivery',          description: 'Package delivery flow' },
      { name: 'Wallet',            description: 'Wallet balance and funding' },
      { name: 'Admin Auth',        description: 'Admin login and account management' },
      { name: 'Admin Dashboard',   description: 'Overview stats and analytics' },
      { name: 'Admin Users',       description: 'Sender management' },
      { name: 'Admin Drivers',     description: 'Driver management and approvals' },
      { name: 'Admin Deliveries',  description: 'All deliveries and live tracking' },
      { name: 'Admin Payments',    description: 'Payment history and payouts' },
      { name: 'Admin Migrations',  description: 'One-time data migration scripts (super_admin only)' },
    ],

    paths: {

      // ══════════════════════════════════════════════════════════════════════
      // AUTH
      // ══════════════════════════════════════════════════════════════════════
      '/api/auth/signup': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new sender or driver',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['fullName', 'email', 'phone', 'password', 'userType'],
                  properties: {
                    fullName: { type: 'string', example: 'John Wilson' },
                    email:    { type: 'string', example: 'john@example.com' },
                    phone:    { type: 'string', example: '09074563789' },
                    password: { type: 'string', example: 'Secret123!' },
                    userType: { type: 'string', enum: ['sender', 'driver'] },
                  },
                },
              },
            },
          },
          responses: {
            ...created('Account created. OTP sent to email.', {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'OTP sent to john@example.com' },
                userId:  { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d1' },
              },
            }),
            409: { description: 'Email already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/auth/verify-otp': {
        post: {
          tags: ['Auth'],
          summary: 'Verify email OTP and get JWT token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['email', 'otp'],
                  properties: {
                    email: { type: 'string', example: 'john@example.com' },
                    otp:   { type: 'string', example: '3791' },
                  },
                },
              },
            },
          },
          responses: ok('OTP verified. Returns JWT and user profile.', {
            type: 'object',
            properties: {
              token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
              user:  { $ref: '#/components/schemas/User' },
            },
          }),
        },
      },

      '/api/auth/resend-otp': {
        post: {
          tags: ['Auth'],
          summary: 'Resend OTP to email',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', example: 'john@example.com' } } },
              },
            },
          },
          responses: ok('OTP resent.', { type: 'object', properties: { message: { type: 'string', example: 'OTP resent to john@example.com' } } }),
        },
      },

      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login as sender or driver',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['email', 'password', 'userType'],
                  properties: {
                    email:    { type: 'string', example: 'john@example.com' },
                    password: { type: 'string', example: 'Secret123!' },
                    userType: { type: 'string', enum: ['sender', 'driver'] },
                  },
                },
              },
            },
          },
          responses: ok('Login successful.', {
            type: 'object',
            properties: {
              token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
              user:  { $ref: '#/components/schemas/User' },
            },
          }),
        },
      },

      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get currently authenticated user',
          security: [{ userAuth: [] }],
          responses: ok('Current user.', { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }),
        },
      },

      '/api/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request a password reset OTP',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } } } },
          },
          responses: ok('Reset OTP sent.', { type: 'object', properties: { message: { type: 'string', example: 'Reset OTP sent to john@example.com' } } }),
        },
      },

      '/api/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset password with OTP',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['email', 'otp', 'newPassword'],
                  properties: {
                    email:       { type: 'string' },
                    otp:         { type: 'string', example: '4821' },
                    newPassword: { type: 'string', example: 'NewSecret123!' },
                  },
                },
              },
            },
          },
          responses: ok('Password reset successful.', { type: 'object', properties: { message: { type: 'string', example: 'Password updated successfully' } } }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // USER
      // ══════════════════════════════════════════════════════════════════════
      '/api/users/me': {
        get: {
          tags: ['User'],
          summary: 'Get sender profile',
          security: [{ userAuth: [] }],
          responses: ok('Sender profile.', { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }),
        },
        patch: {
          tags: ['User'],
          summary: 'Update sender profile',
          security: [{ userAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string', example: 'John Wilson' },
                    phone:    { type: 'string', example: '09074563789' },
                    photo:    { type: 'string', example: 'https://res.cloudinary.com/pickar/image/upload/v1/photo.jpg' },
                  },
                },
              },
            },
          },
          responses: ok('Profile updated.', { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }),
        },
        delete: {
          tags: ['User'],
          summary: 'Delete account — refunds escrow, notifies driver via Socket.IO',
          security: [{ userAuth: [] }],
          responses: ok('Account deleted.', { type: 'object', properties: { message: { type: 'string', example: 'Account deleted successfully' } } }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // DRIVER
      // ══════════════════════════════════════════════════════════════════════
      '/api/drivers/me': {
        get: {
          tags: ['Driver'],
          summary: 'Get driver profile',
          security: [{ userAuth: [] }],
          responses: ok('Driver profile.', { type: 'object', properties: { driver: { $ref: '#/components/schemas/Driver' } } }),
        },
        patch: {
          tags: ['Driver'],
          summary: 'Update driver profile (name, phone, photo, vehicle)',
          security: [{ userAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name:    { type: 'string' },
                    phone:   { type: 'string' },
                    photo:   { type: 'string' },
                    vehicle: { $ref: '#/components/schemas/Vehicle' },
                  },
                },
              },
            },
          },
          responses: ok('Profile updated.', { type: 'object', properties: { driver: { $ref: '#/components/schemas/Driver' } } }),
        },
      },

      '/api/drivers/online': {
        post: {
          tags: ['Driver'],
          summary: 'Go online and start accepting deliveries',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['lat', 'lng'],
                  properties: {
                    lat: { type: 'number', example: 6.5244 },
                    lng: { type: 'number', example: 3.3792 },
                  },
                },
              },
            },
          },
          responses: ok('Driver is now online.', {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'online' },
              driver: { $ref: '#/components/schemas/Driver' },
            },
          }),
        },
      },

      '/api/drivers/offline': {
        post: {
          tags: ['Driver'],
          summary: 'Go offline and stop receiving deliveries',
          security: [{ userAuth: [] }],
          responses: ok('Driver is now offline.', {
            type: 'object',
            properties: { status: { type: 'string', example: 'offline' } },
          }),
        },
      },

      '/api/drivers/location': {
        patch: {
          tags: ['Driver'],
          summary: 'Update driver GPS location (called on interval while online)',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['lat', 'lng'],
                  properties: {
                    lat: { type: 'number', example: 6.5244 },
                    lng: { type: 'number', example: 3.3792 },
                  },
                },
              },
            },
          },
          responses: ok('Location updated.', {
            type: 'object',
            properties: {
              location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
            },
          }),
        },
      },

      '/api/drivers/nearby': {
        get: {
          tags: ['Driver'],
          summary: 'Get nearby online drivers for the map preview',
          security: [{ userAuth: [] }],
          parameters: [
            { name: 'lat',      in: 'query', required: true,  schema: { type: 'number', example: 6.5244 } },
            { name: 'lng',      in: 'query', required: true,  schema: { type: 'number', example: 3.3792 } },
            { name: 'rideType', in: 'query', required: false, schema: { type: 'string', enum: ['bike', 'truck'] } },
          ],
          responses: ok('Nearby drivers.', {
            type: 'object',
            properties: {
              drivers: { type: 'array', items: { $ref: '#/components/schemas/Driver' } },
            },
          }),
        },
      },

      '/api/drivers/active-trip': {
        get: {
          tags: ['Driver'],
          summary: "Get driver's current active delivery",
          security: [{ userAuth: [] }],
          responses: ok('Active delivery or null.', {
            type: 'object',
            properties: {
              delivery: {
                oneOf: [
                  { $ref: '#/components/schemas/Delivery' },
                  { type: 'object', nullable: true, example: null },
                ],
              },
            },
          }),
        },
      },

      '/api/drivers/earnings': {
        get: {
          tags: ['Driver'],
          summary: "Get driver earnings — total balance, today's stats, recent transactions",
          security: [{ userAuth: [] }],
          responses: ok("Driver earnings.", {
            type: 'object',
            properties: {
              balance:       { type: 'number',  example: 35000 },
              todayEarnings: { type: 'number',  example: 6000 },
              todayTrips:    { type: 'integer', example: 3 },
              totalEarned:   { type: 'number',  example: 100000 },
              transactions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:        { type: 'string' },
                    amount:    { type: 'number', example: 6000 },
                    userName:  { type: 'string', example: 'John Wilson' },
                    userPhoto: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // DELIVERY
      // ══════════════════════════════════════════════════════════════════════
      '/api/deliveries/initiate': {
        post: {
          tags: ['Delivery'],
          summary: 'Create a new delivery — returns delivery ID and available ride options',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pickupAddress', 'recipientName', 'recipientPhone', 'recipientAddress', 'packageType'],
                  properties: {
                    pickupAddress:    { $ref: '#/components/schemas/Address' },
                    recipientName:    { type: 'string', example: 'Kevin Gilbert' },
                    recipientPhone:   { type: 'string', example: '09074563789' },
                    recipientAddress: { $ref: '#/components/schemas/Address' },
                    packageType:      { type: 'string', enum: ['fragile', 'non_fragile'] },
                    agreedToInsurance: { type: 'boolean', example: false },
                  },
                },
              },
            },
          },
          responses: {
            ...created('Delivery initiated.', {
              type: 'object',
              properties: {
                delivery: { $ref: '#/components/schemas/Delivery' },
                rideOptions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type:        { type: 'string', enum: ['standard', 'eco_send', 'express', 'truck'] },
                      label:       { type: 'string', example: 'Standard' },
                      price:       { type: 'number', example: 6000 },
                      description: { type: 'string', example: 'Regular delivery' },
                      eta:         { type: 'string', example: '30 mins' },
                    },
                  },
                },
              },
            }),
          },
        },
      },

      '/api/deliveries/{id}/select-ride': {
        post: {
          tags: ['Delivery'],
          summary: 'Select ride type — triggers driver search',
          security: [{ userAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['rideType'],
                  properties: { rideType: { type: 'string', enum: ['standard', 'eco_send', 'express', 'truck'] } },
                },
              },
            },
          },
          responses: ok('Ride type selected. Driver search started.', {
            type: 'object',
            properties: {
              delivery: { $ref: '#/components/schemas/Delivery' },
              message:  { type: 'string', example: 'Searching for nearby drivers...' },
            },
          }),
        },
      },

      '/api/deliveries/{id}/status': {
        get: {
          tags: ['Delivery'],
          summary: 'Poll for delivery status — used by the finding-driver screen',
          security: [{ userAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: ok('Delivery with populated driver.', {
            type: 'object',
            properties: { delivery: { $ref: '#/components/schemas/Delivery' } },
          }),
        },
      },

      '/api/deliveries/{id}/cancel': {
        post: {
          tags: ['Delivery'],
          summary: 'Cancel a delivery (only allowed before driver is assigned)',
          security: [{ userAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: ok('Delivery cancelled. Escrow refunded.', {
            type: 'object',
            properties: {
              message:       { type: 'string', example: 'Delivery cancelled and refund issued' },
              refundAmount:  { type: 'number', example: 6000 },
            },
          }),
        },
      },

      '/api/deliveries/history': {
        get: {
          tags: ['Delivery'],
          summary: "Sender's delivery history",
          security: [{ userAuth: [] }],
          responses: ok('Delivery history.', {
            type: 'object',
            properties: {
              deliveries: { type: 'array', items: { $ref: '#/components/schemas/Delivery' } },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // WALLET
      // ══════════════════════════════════════════════════════════════════════
      '/api/wallet': {
        get: {
          tags: ['Wallet'],
          summary: 'Get wallet balance and recent transactions',
          security: [{ userAuth: [] }],
          responses: ok('Wallet data.', {
            type: 'object',
            properties: { wallet: { $ref: '#/components/schemas/Wallet' } },
          }),
        },
      },

      '/api/wallet/add-funds': {
        post: {
          tags: ['Wallet'],
          summary: 'Initialise a Paystack payment to top up wallet',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', example: 5000 } } },
              },
            },
          },
          responses: ok('Paystack payment initialised.', {
            type: 'object',
            properties: {
              authorizationUrl: { type: 'string', example: 'https://checkout.paystack.com/abc123' },
              reference:        { type: 'string', example: 'PAY_abc123xyz' },
              amount:           { type: 'number', example: 5000 },
            },
          }),
        },
      },

      '/api/wallet/verify-payment': {
        post: {
          tags: ['Wallet'],
          summary: 'Verify Paystack payment and credit wallet',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['reference'], properties: { reference: { type: 'string', example: 'PAY_abc123xyz' } } },
              },
            },
          },
          responses: ok('Payment verified and wallet credited.', {
            type: 'object',
            properties: {
              amountAdded: { type: 'number', example: 5000 },
              newBalance:  { type: 'number', example: 40000 },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN — AUTH
      // ══════════════════════════════════════════════════════════════════════
      '/api/admin/auth/login': {
        post: {
          tags: ['Admin Auth'],
          summary: 'Admin login',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['email', 'password'],
                  properties: {
                    email:    { type: 'string', example: 'admin@pickar.ng' },
                    password: { type: 'string', example: 'SuperSecret123!' },
                  },
                },
              },
            },
          },
          responses: ok('Admin login successful.', {
            type: 'object',
            properties: {
              token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
              admin: { $ref: '#/components/schemas/Admin' },
            },
          }),
        },
      },

      '/api/admin/auth/me': {
        get: {
          tags: ['Admin Auth'],
          summary: 'Get logged-in admin profile',
          security: [{ adminAuth: [] }],
          responses: ok('Admin profile.', { type: 'object', properties: { admin: { $ref: '#/components/schemas/Admin' } } }),
        },
      },

      '/api/admin/auth/create': {
        post: {
          tags: ['Admin Auth'],
          summary: 'Create a new admin account (super_admin only)',
          security: [{ adminAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['fullName', 'email', 'password'],
                  properties: {
                    fullName: { type: 'string', example: 'Support Staff' },
                    email:    { type: 'string', example: 'support@pickar.ng' },
                    password: { type: 'string', example: 'Support123!' },
                    role:     { type: 'string', enum: ['super_admin', 'support'], default: 'support' },
                  },
                },
              },
            },
          },
          responses: {
            ...created('Admin account created.', { type: 'object', properties: { admin: { $ref: '#/components/schemas/Admin' } } }),
            403: { description: 'Forbidden — super_admin role required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN — DASHBOARD
      // ══════════════════════════════════════════════════════════════════════
      '/api/admin/dashboard': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Overview — stats cards, delivery analytics chart, recent users & rides',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'period', in: 'query', schema: { type: 'string', enum: ['today', '7d', '30d'], default: '30d' } },
          ],
          responses: ok('Dashboard data.', {
            type: 'object',
            properties: {
              stats: {
                type: 'object',
                properties: {
                  completedDeliveries: { type: 'integer', example: 567 },
                  ongoingDeliveries:   { type: 'integer', example: 23 },
                  activeDrivers:       { type: 'integer', example: 41 },
                  totalRevenue:        { type: 'number',  example: 3402000 },
                  totalUsers:          { type: 'integer', example: 5678 },
                  activeUsers:         { type: 'integer', example: 5200 },
                  totalDrivers:        { type: 'integer', example: 300 },
                  cancelledDeliveries: { type: 'integer', example: 18 },
                  totalDeliveries:     { type: 'integer', example: 608 },
                },
              },
              deliveryAnalytics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id:     { type: 'string',  example: '2025-01-01' },
                    total:   { type: 'integer', example: 120 },
                    ongoing: { type: 'integer', example: 15 },
                  },
                },
              },
              recentUsers:      { type: 'array', items: { $ref: '#/components/schemas/User' } },
              recentDeliveries: { type: 'array', items: { $ref: '#/components/schemas/Delivery' } },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN — USERS
      // ══════════════════════════════════════════════════════════════════════
      '/api/admin/users': {
        get: {
          tags: ['Admin Users'],
          summary: 'Paginated list of all senders with stats',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',  in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'suspended'] } },
            { name: 'search', in: 'query', schema: { type: 'string', example: 'John' } },
          ],
          responses: ok('Paginated users.', {
            type: 'object',
            properties: {
              stats: {
                type: 'object',
                properties: {
                  total:     { type: 'integer', example: 5678 },
                  active:    { type: 'integer', example: 5200 },
                  inactive:  { type: 'integer', example: 400 },
                  suspended: { type: 'integer', example: 78 },
                },
              },
              users:      { type: 'array', items: { $ref: '#/components/schemas/User' } },
              pagination: { $ref: '#/components/schemas/Pagination' },
            },
          }),
        },
      },

      '/api/admin/users/{id}': {
        get: {
          tags: ['Admin Users'],
          summary: 'Full sender profile with delivery history and spend stats',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: ok('User detail.', {
            type: 'object',
            properties: {
              user:  { $ref: '#/components/schemas/User' },
              stats: {
                type: 'object',
                properties: {
                  totalRides: { type: 'integer', example: 24 },
                  totalSpent: { type: 'number',  example: 144000 },
                },
              },
              recentDeliveries: { type: 'array', items: { $ref: '#/components/schemas/Delivery' } },
            },
          }),
        },
      },

      '/api/admin/users/{id}/suspend': {
        patch: {
          tags: ['Admin Users'],
          summary: 'Suspend or unsuspend a sender account',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['suspend'],
                  properties: {
                    suspend: { type: 'boolean', example: true },
                    reason:  { type: 'string',  example: 'Fraudulent activity' },
                  },
                },
              },
            },
          },
          responses: ok('Suspension updated.', {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id:               { type: 'string' },
                  fullName:         { type: 'string' },
                  isSuspended:      { type: 'boolean', example: true },
                  suspensionReason: { type: 'string',  example: 'Fraudulent activity' },
                },
              },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN — DRIVERS
      // ══════════════════════════════════════════════════════════════════════
      '/api/admin/drivers': {
        get: {
          tags: ['Admin Drivers'],
          summary: 'Paginated list of all drivers with stats',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',  in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'pending', 'suspended'] } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: ok('Paginated drivers.', {
            type: 'object',
            properties: {
              stats: {
                type: 'object',
                properties: {
                  total:   { type: 'integer', example: 300 },
                  active:  { type: 'integer', example: 240 },
                  pending: { type: 'integer', example: 18 },
                },
              },
              drivers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:          { type: 'string' },
                    name:        { type: 'string',  example: 'John Wilson' },
                    email:       { type: 'string',  example: 'john@example.com' },
                    phone:       { type: 'string',  example: '09074563789' },
                    photo:       { type: 'string' },
                    vehicle:     { $ref: '#/components/schemas/Vehicle' },
                    rating:      { $ref: '#/components/schemas/Rating' },
                    isApproved:  { type: 'boolean', example: true },
                    isSuspended: { type: 'boolean', example: false },
                    createdAt:   { type: 'string',  format: 'date-time' },
                  },
                },
              },
              pagination: { $ref: '#/components/schemas/Pagination' },
            },
          }),
        },
      },

      '/api/admin/drivers/{id}': {
        get: {
          tags: ['Admin Drivers'],
          summary: 'Full driver profile — personal info, KYC docs, vehicle, trips, earnings',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: ok('Driver detail.', {
            type: 'object',
            properties: {
              driver: {
                type: 'object',
                properties: {
                  id:              { type: 'string' },
                  name:            { type: 'string',  example: 'John Wilson' },
                  email:           { type: 'string',  example: 'john@example.com' },
                  phone:           { type: 'string' },
                  photo:           { type: 'string' },
                  vehicle:         { $ref: '#/components/schemas/Vehicle' },
                  rating:          { $ref: '#/components/schemas/Rating' },
                  isApproved:      { type: 'boolean' },
                  isSuspended:     { type: 'boolean' },
                  idDocument:      { type: 'string', example: 'https://res.cloudinary.com/.../id.jpg' },
                  proofOfAddress:  { type: 'string', example: 'https://res.cloudinary.com/.../poa.jpg' },
                  nationality:     { type: 'string', example: 'Nigerian' },
                  stateOfOrigin:   { type: 'string', example: 'Lagos State' },
                  createdAt:       { type: 'string', format: 'date-time' },
                },
              },
              stats: {
                type: 'object',
                properties: {
                  totalTrips:     { type: 'integer', example: 7846 },
                  averageRating:  { type: 'number',  example: 4.98 },
                  yearsOfService: { type: 'number',  example: 2.5 },
                  totalEarned:    { type: 'number',  example: 4700000 },
                  currentBalance: { type: 'number',  example: 35000 },
                },
              },
            },
          }),
        },
      },

      '/api/admin/drivers/{id}/approval': {
        patch: {
          tags: ['Admin Drivers'],
          summary: 'Approve, reject, or pend a driver application',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['action'],
                  properties: {
                    action: { type: 'string', enum: ['approve', 'reject', 'pend'] },
                    reason: { type: 'string',  example: 'ID document unclear, please resubmit' },
                  },
                },
              },
            },
          },
          responses: ok('Approval updated.', {
            type: 'object',
            properties: {
              driverId: { type: 'string' },
              action:   { type: 'string', example: 'approve' },
            },
          }),
        },
      },

      '/api/admin/drivers/{id}/suspend': {
        patch: {
          tags: ['Admin Drivers'],
          summary: 'Suspend or unsuspend a driver — forces offline if suspending',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['suspend'],
                  properties: {
                    suspend: { type: 'boolean', example: true },
                    reason:  { type: 'string',  example: 'Multiple complaint reports' },
                  },
                },
              },
            },
          },
          responses: ok('Suspension updated.', {
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Driver suspended and taken offline.' },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN — DELIVERIES
      // ══════════════════════════════════════════════════════════════════════
      '/api/admin/deliveries': {
        get: {
          tags: ['Admin Deliveries'],
          summary: 'Paginated deliveries with stats cards',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',    in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status',   in: 'query', schema: { type: 'string', enum: ['completed', 'ongoing', 'cancelled', 'pending'] } },
            { name: 'search',   in: 'query', schema: { type: 'string', description: 'Search by driver or user name' } },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date', example: '2025-01-01' } },
            { name: 'dateTo',   in: 'query', schema: { type: 'string', format: 'date', example: '2025-01-31' } },
          ],
          responses: ok('Deliveries list.', {
            type: 'object',
            properties: {
              stats: {
                type: 'object',
                properties: {
                  completed: { type: 'integer', example: 567 },
                  ongoing:   { type: 'integer', example: 23 },
                  cancelled: { type: 'integer', example: 18 },
                  total:     { type: 'integer', example: 608 },
                },
              },
              deliveries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:                 { type: 'string' },
                    userName:           { type: 'string', example: 'John Wilson' },
                    userPhoto:          { type: 'string' },
                    driverName:         { type: 'string', example: 'Gregor Smith' },
                    status:             { type: 'string', example: 'delivered' },
                    price:              { type: 'number', example: 6000 },
                    rideType:           { type: 'string', example: 'standard' },
                    pickupAddress:      { type: 'string', example: '12 Olagbaiye Street, Mushin' },
                    destinationAddress: { type: 'string', example: '5 Marina Road, Lagos Island' },
                    date:               { type: 'string', format: 'date-time' },
                  },
                },
              },
              pagination: { $ref: '#/components/schemas/Pagination' },
            },
          }),
        },
      },

      '/api/admin/deliveries/{id}': {
        get: {
          tags: ['Admin Deliveries'],
          summary: 'Full delivery detail with tracking timeline — powers the Live Tracking screen',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: ok('Delivery detail.', {
            type: 'object',
            properties: {
              delivery: { $ref: '#/components/schemas/Delivery' },
              driver:   { $ref: '#/components/schemas/Driver' },
              user: {
                type: 'object',
                properties: {
                  id:       { type: 'string' },
                  fullName: { type: 'string', example: 'John Wilson' },
                  email:    { type: 'string' },
                  phone:    { type: 'string' },
                  photo:    { type: 'string' },
                },
              },
              timeline: {
                type: 'array',
                items: { $ref: '#/components/schemas/TrackingStep' },
                example: [
                  { label: 'Order placed',             completed: true,  current: false },
                  { label: 'Driver assigned',           completed: true,  current: false },
                  { label: 'Driver arrived at pickup',  completed: true,  current: false },
                  { label: 'Package picked up',         completed: true,  current: true  },
                  { label: 'Package delivered',         completed: false, current: false },
                ],
              },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN — PAYMENTS
      // ══════════════════════════════════════════════════════════════════════
      '/api/admin/payments': {
        get: {
          tags: ['Admin Payments'],
          summary: 'Payments history with driver payouts and commission stats',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',    in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status',   in: 'query', schema: { type: 'string', enum: ['completed', 'pending'] } },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'dateTo',   in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: ok('Payments data.', {
            type: 'object',
            properties: {
              stats: {
                type: 'object',
                properties: {
                  totalRevenue:    { type: 'number', example: 3402000 },
                  driverPayouts:   { type: 'number', example: 2721600 },
                  commissionEarned:{ type: 'number', example: 680400  },
                },
              },
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:         { type: 'string' },
                    date:       { type: 'string', format: 'date-time' },
                    driverName: { type: 'string', example: 'Gregor Smith' },
                    userName:   { type: 'string', example: 'John Wilson' },
                    amount:     { type: 'number', example: 6000 },
                    status:     { type: 'string', enum: ['completed', 'pending'], example: 'completed' },
                  },
                },
              },
              pagination: { $ref: '#/components/schemas/Pagination' },
            },
          }),
        },
      },

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN — MIGRATIONS
      // ══════════════════════════════════════════════════════════════════════
      '/api/admin/migrations/ratings': {
        post: {
          tags: ['Admin Migrations'],
          summary: 'Convert flat driver rating numbers to { average, count } objects (super_admin only, run once)',
          security: [{ adminAuth: [] }],
          responses: ok('Migration complete.', {
            type: 'object',
            properties: {
              message: { type: 'string',  example: 'Migration complete. 12 driver(s) updated.' },
              updated: { type: 'integer', example: 12 },
            },
          }),
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;