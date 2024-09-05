const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const User = require('./models/user');
const Voter = require('./models/voter');

const app = express();
const port = 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: 'http://localhost:3000', // Update with your frontend URL
  credentials: true
}));
app.use(session({
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/dhyas', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Signup Route
app.post('/api/signup', async (req, res) => {
  const { username, password, role, constituency } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).json({ message: 'User already exists' });
  }

  // Automatic approval and login for admins
  let status = 'pending';
  let user;

  if (role === 'admin') {
    status = 'accepted';
    user = new User({ username, password, role, constituency, status });
    await user.save();

    // Create a user-specific collection for the admin
    const userCollectionName = `user_${username}_collection`;
    await mongoose.connection.db.createCollection(userCollectionName);

    // Automatically log the admin in
    req.session.user = user;
    return res.status(201).json({ message: 'Admin signup and login successful', user });
  } else {
    user = new User({ username, password, role, constituency, status });
    await user.save();
    return res.status(201).json({ message: 'Signup request submitted. Awaiting admin approval.' });
  }
});

// Admin Accept User Route
app.post('/api/admin/accept', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const { username } = req.body;

  // Update user status to 'accepted'
  const user = await User.findOneAndUpdate({ username, role: { $ne: 'admin' } }, { status: 'accepted' }, { new: true });
  if (!user) {
    return res.status(404).json({ message: 'User not found or cannot accept admin user' });
  }

  // Create a user-specific collection only after the user is accepted
  const userCollectionName = `user_${username}_collection`;
  await mongoose.connection.db.createCollection(userCollectionName);

  res.json({ message: 'User accepted successfully', user });
});

// Admin Refuse User Route
app.post('/api/admin/refuse', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const { username } = req.body;

  // Update user status to 'refused'
  const user = await User.findOneAndUpdate({ username, role: { $ne: 'admin' } }, { status: 'refused' }, { new: true });
  if (!user) {
    return res.status(404).json({ message: 'User not found or cannot refuse admin user' });
  }

  res.json({ message: 'User refused successfully', user });
});

// Login Route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  // Find user and verify password
  const user = await User.findOne({ username });
  if (!user || user.password !== password) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  if (user.status !== 'accepted') {
    return res.status(403).json({ message: 'Your signup request is not yet accepted' });
  }

  // Save user to session
  req.session.user = user;
  res.json({ message: 'Login successful', user });
});

// User Info Route
app.get('/api/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

// Admin Dashboard Route
app.get('/api/admin/dashboard', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const { constituency } = req.session.user;

  // Fetch both pending and accepted users within the admin's constituency, excluding admins
  const pendingUsers = await User.find({ constituency, status: 'pending', role: { $ne: 'admin' } });
  const acceptedUsers = await User.find({ constituency, status: 'accepted', role: { $ne: 'admin' } });

  res.json({ pendingUsers, acceptedUsers });
});

// Fetch User Data Route
app.get('/api/user/data', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const userCollectionName = `user_${req.session.user.username}_collection`;
  const userCollection = mongoose.connection.db.collection(userCollectionName);

  // Fetch data from the user's specific collection
  const userData = await userCollection.find().toArray();

  res.json({ userData });
});

// Fetch User Details Route
app.get('/api/user/details/:username', async (req, res) => {
  const { username } = req.params;

  // Find user by username
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({ user });
});

// Admin Create User Route
app.post('/api/admin/users', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const { username, password, role, constituency } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).json({ message: 'User already exists' });
  }

  // Create a new user
  const user = new User({ username, password, role, constituency, status: 'pending' });
  await user.save();

  res.status(201).json({ message: 'User created successfully', user });
});

// Admin View All Collections Route
app.get('/api/admin/collections', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const collections = await mongoose.connection.db.listCollections().toArray();
  res.json({ collections });
});

// Admin View Specific Collection Route
app.get('/api/admin/collections/:collectionName', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const { collectionName } = req.params;

  try {
    const collection = mongoose.connection.db.collection(collectionName);
    const documents = await collection.find().toArray();
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch collection data', error });
  }
});

// Voter List Routes
// Create a new voter
app.post('/api/voters', async (req, res) => {
  try {
    const voter = new Voter(req.body);
    await voter.save();
    res.status(201).json({ message: 'Voter added successfully', voter });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add voter', error });
  }
});

// Get all voters
app.get('/api/voters', async (req, res) => {
  try {
    const voters = await Voter.find();
    res.json(voters);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch voters', error });
  }
});

// Fetch a single voter by ID
app.get('/api/voters/:id', async (req, res) => {
  try {
    const voter = await Voter.findById(req.params.id);
    if (!voter) return res.status(404).json({ message: 'Voter not found' });
    res.json(voter);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch voter', error });
  }
});

// Update a voter by ID
app.put('/api/voters/:id', async (req, res) => {
  try {
    const { name, constituency } = req.body;
    const voter = await Voter.findByIdAndUpdate(req.params.id, { name, constituency }, { new: true });
    if (!voter) return res.status(404).json({ message: 'Voter not found' });
    res.json({ message: 'Voter updated successfully', voter });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update voter', error });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
