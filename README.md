# CHTM Cooks - Student Management System

A modern, full-stack student management system built with SvelteKit, featuring role-based authentication, email verification, password reset, and comprehensive user management.

## 🚀 Features

### Authentication System
- **Student Registration**: Self-service registration with email verification
- **Staff Authentication**: Shortcut key login for instructors and custodians
- **Email Verification**: Secure email confirmation with expiring tokens
- **Password Reset**: Forgot password flow with secure reset links
- **JWT Tokens**: Access and refresh token authentication
- **Rate Limiting**: Protection against brute force attacks

### Role-Based Dashboards
- **Student Dashboard**: Personalized view with year level and block information
- **Admin Dashboard**: Administrative interface for staff members
- **Superadmin Dashboard**: Complete system control with user management

### User Management (Superadmin)
- **Create Users**: Add instructors, custodians, and superadmins
- **Edit Users**: Update user information and roles
- **Delete Users**: Remove users from the system
- **Search & Filter**: Find users by name, email, or role
- **Pagination**: Efficient browsing of large user lists
- **Statistics**: Real-time dashboard stats and analytics

### Security Features
- **Password Hashing**: bcrypt with salt rounds
- **JWT Authentication**: Secure token-based auth
- **Role-Based Access Control (RBAC)**: Fine-grained permissions
- **Input Validation**: Comprehensive server-side validation
- **Rate Limiting**: Redis-based request throttling
- **Security Headers**: CSP, HSTS, and more

## 📚 Documentation

Comprehensive documentation is available:
- **[VERIFICATION_GUIDE.md](./VERIFICATION_GUIDE.md)**: Email verification and password reset system
- **[DASHBOARD_GUIDE.md](./DASHBOARD_GUIDE.md)**: Dashboard features and user management
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)**: Complete testing scenarios
- **[DASHBOARD_TESTING.md](./DASHBOARD_TESTING.md)**: Quick testing reference
- **[POSTMAN_COLLECTION.json](./POSTMAN_COLLECTION.json)**: API collection for Postman

## 🛠️ Tech Stack

### Frontend
- **SvelteKit 2.x**: Full-stack framework
- **Svelte 5**: Modern reactive UI (with runes)
- **TypeScript**: Type-safe development
- **Tailwind CSS 4.x**: Utility-first styling

### Backend
- **SvelteKit API Routes**: RESTful endpoints
- **MongoDB**: Document database
- **Redis**: Caching and rate limiting
- **JWT**: Token authentication
- **bcrypt**: Password hashing

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- MongoDB (local or Atlas)
- Redis (optional, for rate limiting)

### Setup

1. **Clone the repository**
```sh
git clone <repository-url>
cd chtm_cooks
```

2. **Install dependencies**
```sh
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root (or copy from `.env.example`):
```env
# Database
MONGODB_URI=mongodb://localhost:27017/chtm_cooks

# JWT Secrets
JWT_ACCESS_SECRET=your-access-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Email Configuration (for verification/reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-email-password

# Application URL (used in email links)
APP_URL=http://localhost:5173
PUBLIC_BASE_URL=http://localhost:5173

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

4. **Start development server**
```sh
npm run dev
```

The app will be available at `http://localhost:5173`

## 🧪 Testing

### Using Postman

1. **Import collection**
   - Open Postman
   - Import `POSTMAN_COLLECTION.json`
   - Set `baseUrl` variable to `http://localhost:5173`

2. **Test authentication**
   - Register a student account
   - Login to get access token
   - Test protected endpoints

3. **Test user management** (requires superadmin)
   - Login as superadmin
   - Create users (instructors, custodians, superadmins)
   - Edit and delete users
   - Test search and filters

For detailed testing instructions, see [DASHBOARD_TESTING.md](./DASHBOARD_TESTING.md)

### Manual Testing

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for comprehensive manual testing scenarios.

## 🎯 Quick Start

### Create Your First Superadmin

If starting fresh, create a superadmin account via MongoDB:

```javascript
// Connect to MongoDB
mongosh
use chtm_cooks

// Create superadmin (replace password hash)
db.users.insertOne({
  email: "admin@example.com",
  password: "$2a$10$...", // bcrypt hash of your password
  firstName: "Admin",
  lastName: "User",
  role: "superadmin",
  emailVerified: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

Or register normally and update role in database:
```javascript
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { role: "superadmin" } }
);
```

### Access the Dashboard

1. **Student Dashboard**: `http://localhost:5173/dashboard`
2. **Admin Dashboard**: `http://localhost:5173/admin`
3. **User Management**: `http://localhost:5173/admin/users` (superadmin only)

## 📁 Project Structure

```
src/
├── routes/
│   ├── auth/                      # Authentication pages
│   │   ├── login/                 # Login page
│   │   ├── register/              # Registration page
│   │   ├── forgot-password/       # Password reset request
│   │   ├── reset-password/        # New password entry
│   │   └── verify-email/          # Email verification
│   ├── (protected)/               # Protected routes
│   │   ├── dashboard/             # Student dashboard
│   │   └── admin/                 # Admin dashboards
│   │       ├── +page.svelte       # Main admin dashboard
│   │       └── users/             # User management (superadmin)
│   └── api/                       # API endpoints
│       ├── auth/                  # Authentication APIs
│       ├── dashboard/             # Dashboard statistics
│       └── users/                 # User management CRUD
├── lib/
│   ├── components/
│   │   ├── ui/                    # Reusable UI components
│   │   └── admin/                 # Admin-specific components
│   ├── stores/                    # Svelte stores
│   └── server/                    # Server-side code
│       ├── models/                # Data models
│       ├── utils/                 # Utilities (JWT, password, etc.)
│       ├── middleware/            # Request middleware
│       └── services/              # Business logic
└── static/                        # Static assets
```

## 🔐 User Roles

### Student
- Self-registration with email verification
- Access to personal dashboard
- View year level and block information

### Instructor
- No self-registration (created by superadmin)
- Shortcut key authentication
- Access to admin dashboard
- View student statistics

### Custodian
- No self-registration (created by superadmin)
- Shortcut key authentication
- Access to admin dashboard
- Same permissions as instructor

### Superadmin
- Created by other superadmins or database
- Full system access
- User management (create/edit/delete)
- System statistics and analytics
- All permissions

## 🚀 Deployment

### Building for Production

```sh
npm run build
```

### Preview Production Build

```sh
npm run preview
```

### Deployment Platforms

- **Vercel**: Zero-config deployment
- **Netlify**: Automatic builds
- **Custom Server**: Node.js server with adapter-node

See [SvelteKit adapters](https://svelte.dev/docs/kit/adapters) for deployment options.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

[Your License Here]

## 📧 Support

For issues or questions:
1. Check the documentation files
2. Review Postman collection examples
3. Check browser console for frontend errors
4. Review server logs for backend errors
5. Contact the development team

---

**Built with ❤️ using SvelteKit**

