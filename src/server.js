import app from './app.js';
import { connectDb } from './config/db.js';
import User from './models/user.model.js';  // Import the User model

const PORT = process.env.PORT || 8000;

async function createAdminUser() {
  try {
    // Check if the admin user exists
    const adminUser = await User.findOne({ username: 'admin' });
    
    if (!adminUser) {
      const newAdminUser = new User({
        username: 'admin',
        password: 'admin_arka',
      });

      await newAdminUser.save(); // Save the new admin user to the database
      console.log('Admin user created');
    } else {
      console.log('Admin user already exists');
    }
  } catch (err) {
    console.error('Error creating admin user:', err);
  }
}

async function startServer() {
  try {
    // Connect to the database
    await connectDb();
    
    // Create the admin user if it doesn't exist
    await createAdminUser();

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();