const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Pickar API',
      version: '1.0.0',
      description: 'Backend API documentation for Pickar — Nigeria\'s on-demand package delivery platform.',
      contact: {
        name: 'Pickar Engineering',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://pickar-backend.onrender.com',
        description: 'Production server ',
      },
    ],
    components: {
      securitySchemes: {
        userAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for sender/driver users',
        },
        adminAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for admin accounts (contains adminId)',
        },
      },
      schemas: {
        // ── Shared ──────────────────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message here' },
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

        // ── Auth ─────────────────────────────────────────────────────────────
        SignupRequest: {
          type: 'object',
          required: ['fullName', 'email', 'phone', 'password', 'userType'],
          properties: {
            fullName: { type: 'string', example: 'John Wilson' },
            email:    { type: 'string', example: 'john@example.com' },
            phone:    { type: 'string', example: '09074563789' },
            password: { type: 'string', example: 'Secret123!' },
            userType: { type: 'string', enum: ['sender', 'driver'] },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password', 'userType'],
          properties: {
            email:    { type: 'string', example: 'john@example.com' },
            password: { type: 'string', example: 'Secret123!' },
            userType: { type: 'string', enum: ['sender', 'driver'] },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
              },
            },
          },
        },

        // ── User ─────────────────────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id:          { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d1' },
            fullName:    { type: 'string', example: 'John Wilson' },
            email:       { type: 'string', example: 'john@example.com' },
            phone:       { type: 'string', example: '09074563789' },
            userType:    { type: 'string', enum: ['sender', 'driver'] },
            isVerified:  { type: 'boolean', example: true },
            isApproved:  { type: 'boolean', example: true, description: 'Drivers only' },
            isSuspended: { type: 'boolean', example: false },
            photo:       { type: 'string', example: 'https://res.cloudinary.com/...' },
            createdAt:   { type: 'string', format: 'date-time' },
          },
        },

        // ── Driver ───────────────────────────────────────────────────────────
        Driver: {
          type: 'object',
          properties: {
            id:     { type: 'string' },
            name:   { type: 'string', example: 'John Wilson' },
            phone:  { type: 'string', example: '09074563789' },
            photo:  { type: 'string' },
            status: { type: 'string', enum: ['offline', 'online', 'busy'] },
            vehicle: {
              type: 'object',
              properties: {
                type:        { type: 'string', enum: ['bike', 'truck'] },
                plateNumber: { type: 'string', example: 'JKH34NK' },
              },
            },
            rating: {
              type: 'object',
              properties: {
                average: { type: 'number', example: 4.98 },
                count:   { type: 'integer', example: 120 },
              },
            },
            location: {
              type: 'object',
              properties: {
                type:        { type: 'string', example: 'Point' },
                coordinates: { type: 'array', items: { type: 'number' }, example: [3.3792, 6.5244] },
              },
            },
          },
        },

        // ── Delivery ─────────────────────────────────────────────────────────
        Delivery: {
          type: 'object',
          properties: {
            id:     { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'searching_driver', 'driver_assigned', 'driver_arrived', 'in_transit', 'delivered', 'cancelled'],
            },
            price:       { type: 'number', example: 6000 },
            rideType:    { type: 'string', enum: ['standard', 'eco_send', 'express', 'truck'] },
            packageType: { type: 'string', enum: ['fragile', 'non_fragile'] },
            pickupAddress: {
              type: 'object',
              properties: {
                label: { type: 'string', example: '12 Olagbaiye Street, Mushin' },
                coordinates: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' },
                  },
                },
              },
            },
            recipient: {
              type: 'object',
              properties: {
                name:  { type: 'string', example: 'Kevin Gilbert' },
                phone: { type: 'string', example: '09074563789' },
                address: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    coordinates: {
                      type: 'object',
                      properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
            driver:    { $ref: '#/components/schemas/Driver' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        // ── Wallet ───────────────────────────────────────────────────────────
        Wallet: {
          type: 'object',
          properties: {
            id:       { type: 'string' },
            balance:  { type: 'number', example: 35000 },
            currency: { type: 'string', example: 'NGN' },
          },
        },

        // ── Admin ────────────────────────────────────────────────────────────
        Admin: {
          type: 'object',
          properties: {
            id:        { type: 'string' },
            fullName:  { type: 'string', example: 'Pickar Super Admin' },
            email:     { type: 'string', example: 'admin@pickar.ng' },
            role:      { type: 'string', enum: ['super_admin', 'support'] },
            isActive:  { type: 'boolean', example: true },
            lastLogin: { type: 'string', format: 'date-time' },
          },
        },
      },
    },

    // ── Tags (groups in the sidebar) ─────────────────────────────────────────
    tags: [
      { name: 'Auth',      description: 'Signup, login, OTP verification' },
      { name: 'User',      description: 'Sender profile management' },
      { name: 'Driver',    description: 'Driver profile, location, trips' },
      { name: 'Delivery',  description: 'Package delivery flow' },
      { name: 'Wallet',    description: 'Wallet balance and funding' },
      { name: 'Admin Auth',       description: 'Admin login and account management' },
      { name: 'Admin Dashboard',  description: 'Overview stats and analytics' },
      { name: 'Admin Users',      description: 'Sender management' },
      { name: 'Admin Drivers',    description: 'Driver management and approvals' },
      { name: 'Admin Deliveries', description: 'All deliveries and live tracking' },
      { name: 'Admin Payments',   description: 'Payment history and payouts' },
      { name: 'Admin Migrations', description: 'One-time data migration scripts' },
    ],

    paths: {

      // ════════════════════════════════════════════════════════════════════════
      // AUTH
      // ════════════════════════════════════════════════════════════════════════
      '/api/auth/signup': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new sender or driver',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SignupRequest' } },
            },
          },
          responses: {
            201: { description: 'Registration successful. OTP sent to email.' },
            400: { description: 'Validation error or email already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/verify-otp': {
        post: {
          tags: ['Auth'],
          summary: 'Verify OTP and activate account',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'otp'],
                  properties: {
                    email: { type: 'string', example: 'john@example.com' },
                    otp:   { type: 'string', example: '3791' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Email verified. Returns JWT token.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            400: { description: 'Invalid or expired OTP' },
          },
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
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: { email: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'OTP sent successfully' },
            404: { description: 'User not found' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login as sender or driver',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
            },
          },
          responses: {
            200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
            401: { description: 'Invalid credentials or unverified account' },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current authenticated user',
          security: [{ userAuth: [] }],
          responses: {
            200: { description: 'Current user profile' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout (client should discard token)',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Logged out successfully' } },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request password reset OTP',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: { email: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Reset OTP sent to email' },
            404: { description: 'User not found' },
          },
        },
      },
      '/api/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset password using OTP',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'otp', 'newPassword'],
                  properties: {
                    email:       { type: 'string' },
                    otp:         { type: 'string' },
                    newPassword: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password reset successful' },
            400: { description: 'Invalid or expired OTP' },
          },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // USER
      // ════════════════════════════════════════════════════════════════════════
      '/api/users/me': {
        get: {
          tags: ['User'],
          summary: 'Get sender profile',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'User profile data' } },
        },
        patch: {
          tags: ['User'],
          summary: 'Update sender profile (name, phone, photo)',
          security: [{ userAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string' },
                    phone:    { type: 'string' },
                    photo:    { type: 'string', description: 'Cloudinary URL' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profile updated' } },
        },
        delete: {
          tags: ['User'],
          summary: 'Delete sender account (refunds escrow, notifies driver)',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Account deleted' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // DRIVER
      // ════════════════════════════════════════════════════════════════════════
      '/api/drivers/me': {
        get: {
          tags: ['Driver'],
          summary: 'Get driver profile',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Driver profile data' } },
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
                    vehicle: {
                      type: 'object',
                      properties: {
                        type:        { type: 'string', enum: ['bike', 'truck'] },
                        plateNumber: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profile updated' } },
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
                  type: 'object',
                  required: ['lat', 'lng'],
                  properties: {
                    lat: { type: 'number', example: 6.5244 },
                    lng: { type: 'number', example: 3.3792 },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Driver is now online' } },
        },
      },
      '/api/drivers/offline': {
        post: {
          tags: ['Driver'],
          summary: 'Go offline and stop receiving deliveries',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Driver is now offline' } },
        },
      },
      '/api/drivers/location': {
        patch: {
          tags: ['Driver'],
          summary: 'Update driver GPS location',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['lat', 'lng'],
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Location updated' } },
        },
      },
      '/api/drivers/nearby': {
        get: {
          tags: ['Driver'],
          summary: 'Get nearby online drivers',
          security: [{ userAuth: [] }],
          parameters: [
            { name: 'lat',      in: 'query', required: true,  schema: { type: 'number' } },
            { name: 'lng',      in: 'query', required: true,  schema: { type: 'number' } },
            { name: 'rideType', in: 'query', required: false, schema: { type: 'string', enum: ['truck', 'standard'] } },
          ],
          responses: { 200: { description: 'List of nearby drivers with location' } },
        },
      },
      '/api/drivers/active-trip': {
        get: {
          tags: ['Driver'],
          summary: 'Get driver\'s current active trip',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Active delivery or null' } },
        },
      },
      '/api/drivers/active-trips': {
        get: {
          tags: ['Driver'],
          summary: 'Get all active trips for driver (sorted oldest first)',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Array of active deliveries' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // DELIVERY
      // ════════════════════════════════════════════════════════════════════════
      '/api/deliveries/initiate': {
        post: {
          tags: ['Delivery'],
          summary: 'Initiate a new delivery request',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pickupAddress', 'recipientAddress', 'recipientName', 'recipientPhone', 'packageType'],
                  properties: {
                    pickupAddress: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        coordinates: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                      },
                    },
                    recipientAddress: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        coordinates: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                      },
                    },
                    recipientName:     { type: 'string' },
                    recipientPhone:    { type: 'string' },
                    packageType:       { type: 'string', enum: ['fragile', 'non_fragile'] },
                    agreedToInsurance: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Delivery initiated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Delivery' } } } },
          },
        },
      },
      '/api/deliveries/ride-options': {
        get: {
          tags: ['Delivery'],
          summary: 'Get available ride types and prices for a delivery',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'List of ride options with prices' } },
        },
      },
      '/api/deliveries/{id}/select-ride': {
        post: {
          tags: ['Delivery'],
          summary: 'Select a ride type for the delivery',
          security: [{ userAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['rideType'],
                  properties: { rideType: { type: 'string', enum: ['standard', 'eco_send', 'express', 'truck'] } },
                },
              },
            },
          },
          responses: { 200: { description: 'Ride type selected, searching for driver' } },
        },
      },
      '/api/deliveries/{id}/status': {
        get: {
          tags: ['Delivery'],
          summary: 'Get real-time delivery status (polled by finding-driver screen)',
          security: [{ userAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Delivery with populated driver data' } },
        },
      },
      '/api/deliveries/{id}/confirm-pickup': {
        post: {
          tags: ['Delivery'],
          summary: 'Sender confirms pickup location',
          security: [{ userAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Pickup confirmed' } },
        },
      },
      '/api/deliveries/{id}/cancel': {
        post: {
          tags: ['Delivery'],
          summary: 'Cancel a delivery (only before driver is assigned)',
          security: [{ userAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Delivery cancelled' },
            400: { description: 'Cannot cancel — driver already assigned' },
          },
        },
      },
      '/api/deliveries/history': {
        get: {
          tags: ['Delivery'],
          summary: 'Get sender\'s delivery history (last 20)',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Array of past deliveries' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // WALLET
      // ════════════════════════════════════════════════════════════════════════
      '/api/wallet': {
        get: {
          tags: ['Wallet'],
          summary: 'Get wallet balance and recent transactions',
          security: [{ userAuth: [] }],
          responses: { 200: { description: 'Wallet data', content: { 'application/json': { schema: { $ref: '#/components/schemas/Wallet' } } } } },
        },
      },
      '/api/wallet/add-funds': {
        post: {
          tags: ['Wallet'],
          summary: 'Initialise a Paystack payment to add funds',
          security: [{ userAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount'],
                  properties: { amount: { type: 'number', example: 5000 } },
                },
              },
            },
          },
          responses: { 200: { description: 'Paystack authorisation URL returned' } },
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
                schema: {
                  type: 'object',
                  required: ['reference'],
                  properties: { reference: { type: 'string' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Wallet credited' } },
        },
      },
      '/api/wallet/webhook': {
        post: {
          tags: ['Wallet'],
          summary: 'Paystack webhook — called automatically by Paystack (not for frontend use)',
          responses: { 200: { description: 'Webhook received' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // ADMIN — AUTH
      // ════════════════════════════════════════════════════════════════════════
      '/api/admin/auth/login': {
        post: {
          tags: ['Admin Auth'],
          summary: 'Admin login',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email:    { type: 'string', example: 'admin@pickar.ng' },
                    password: { type: 'string', example: 'SuperSecret123!' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          admin: { $ref: '#/components/schemas/Admin' },
                          token: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/api/admin/auth/me': {
        get: {
          tags: ['Admin Auth'],
          summary: 'Get logged-in admin profile',
          security: [{ adminAuth: [] }],
          responses: { 200: { description: 'Admin profile' } },
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
                  type: 'object',
                  required: ['fullName', 'email', 'password'],
                  properties: {
                    fullName: { type: 'string' },
                    email:    { type: 'string' },
                    password: { type: 'string' },
                    role:     { type: 'string', enum: ['super_admin', 'support'], default: 'support' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Admin created' },
            403: { description: 'Forbidden — super_admin role required' },
          },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // ADMIN — DASHBOARD
      // ════════════════════════════════════════════════════════════════════════
      '/api/admin/dashboard': {
        get: {
          tags: ['Admin Dashboard'],
          summary: 'Overview stats, delivery analytics chart, recent users & deliveries',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'period', in: 'query', schema: { type: 'string', enum: ['today', '7d', '30d'], default: '30d' } },
          ],
          responses: {
            200: {
              description: 'Dashboard data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      stats: {
                        type: 'object',
                        properties: {
                          completedDeliveries: { type: 'integer' },
                          ongoingDeliveries:   { type: 'integer' },
                          activeDrivers:       { type: 'integer' },
                          totalRevenue:        { type: 'number' },
                          totalUsers:          { type: 'integer' },
                        },
                      },
                      deliveryAnalytics: { type: 'array', items: { type: 'object', properties: { _id: { type: 'string' }, total: { type: 'integer' }, ongoing: { type: 'integer' } } } },
                      recentUsers:       { type: 'array', items: { $ref: '#/components/schemas/User' } },
                      recentDeliveries:  { type: 'array', items: { $ref: '#/components/schemas/Delivery' } },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // ADMIN — USERS
      // ════════════════════════════════════════════════════════════════════════
      '/api/admin/users': {
        get: {
          tags: ['Admin Users'],
          summary: 'Paginated list of all senders',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',  in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'suspended'] } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated users with stats' } },
        },
      },
      '/api/admin/users/{id}': {
        get: {
          tags: ['Admin Users'],
          summary: 'Get full sender profile and delivery history',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'User detail' }, 404: { description: 'Not found' } },
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
                  type: 'object',
                  required: ['suspend'],
                  properties: {
                    suspend: { type: 'boolean' },
                    reason:  { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Suspension toggled' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // ADMIN — DRIVERS
      // ════════════════════════════════════════════════════════════════════════
      '/api/admin/drivers': {
        get: {
          tags: ['Admin Drivers'],
          summary: 'Paginated list of all drivers',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',  in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'pending', 'suspended'] } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Paginated drivers with stats' } },
        },
      },
      '/api/admin/drivers/{id}': {
        get: {
          tags: ['Admin Drivers'],
          summary: 'Get full driver profile — personal info, KYC docs, earnings, vehicle',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Driver detail with stats' }, 404: { description: 'Not found' } },
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
                  type: 'object',
                  required: ['action'],
                  properties: {
                    action: { type: 'string', enum: ['approve', 'reject', 'pend'] },
                    reason: { type: 'string', description: 'Required for reject/pend' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Approval status updated' } },
        },
      },
      '/api/admin/drivers/{id}/suspend': {
        patch: {
          tags: ['Admin Drivers'],
          summary: 'Suspend or unsuspend a driver (forces offline if suspending)',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['suspend'],
                  properties: {
                    suspend: { type: 'boolean' },
                    reason:  { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Suspension toggled' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // ADMIN — DELIVERIES
      // ════════════════════════════════════════════════════════════════════════
      '/api/admin/deliveries': {
        get: {
          tags: ['Admin Deliveries'],
          summary: 'Paginated list of all deliveries with stats',
          security: [{ adminAuth: [] }],
          parameters: [
            { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',    in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status',   in: 'query', schema: { type: 'string', enum: ['completed', 'ongoing', 'cancelled', 'pending'] } },
            { name: 'search',   in: 'query', schema: { type: 'string', description: 'Search by driver or user name' } },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'dateTo',   in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Deliveries list with stats cards' } },
        },
      },
      '/api/admin/deliveries/{id}': {
        get: {
          tags: ['Admin Deliveries'],
          summary: 'Full delivery detail with tracking timeline, driver, user, recipient',
          security: [{ adminAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Delivery detail' }, 404: { description: 'Not found' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // ADMIN — PAYMENTS
      // ════════════════════════════════════════════════════════════════════════
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
          responses: { 200: { description: 'Payments with stats' } },
        },
      },

      // ════════════════════════════════════════════════════════════════════════
      // ADMIN — MIGRATIONS
      // ════════════════════════════════════════════════════════════════════════
      '/api/admin/migrations/ratings': {
        post: {
          tags: ['Admin Migrations'],
          summary: 'Migrate flat driver rating numbers to { average, count } objects (super_admin only)',
          security: [{ adminAuth: [] }],
          responses: {
            200: {
              description: 'Migration complete',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      updated: { type: 'integer', example: 12 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [], // all paths defined above — no JSDoc scanning needed
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;