import express from 'express';
import bodyParser from 'body-parser';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import bcrypt from 'bcrypt'; // For password hashing
import session from 'express-session'; // For session management

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mclarens',
    password: 'Ravindu@2001',
    port: 5432,
});

app.use(session({
    secret: 'your-secret-key', // Change this to a real secret
    resave: false,
    saveUninitialized: true
}));

// Middleware to protect routes
const ensureAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Render login page
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/'); // Redirect to home if already authenticated
    }
    res.render('login', { title: 'Login' });
});

// Handle login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

        if (result.rows.length > 0) {
            const user = result.rows[0];

            console.log('Fetched user from database:', user); // Debugging log

            // Directly compare plain text passwords
            if (password === user.password) {
                req.session.user = user; // Store user info in session
                res.redirect('/');
            } else {
                res.status(401).send('Invalid username or password');
            }
        } else {
            res.status(401).send('Invalid username or password');
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal server error');
    }
});

// Apply authentication middleware to all routes except login
app.use((req, res, next) => {
    if (req.path === '/login' || req.path.startsWith('/public')) {
        next();
    } else {
        ensureAuthenticated(req, res, next);
    }
});

// Route for home page (protected)
app.get('/', async (req, res) => {
    try {
        const { totalDomains, activeDomains } = await fetchDomainStatistics();
        res.render('index', {
            title: 'Home Page',
            activeDomains,
            totalDomains
        });
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// Route to search for domain
app.get('/search-domain', async (req, res) => {
    const domainName = req.query.domainName;
    try {
        const result = await pool.query('SELECT * FROM domains WHERE domain_name = $1', [domainName]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Domain not found' });
        }
    } catch (error) {
        console.error('Error querying the database:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route to update domain information
app.post('/update-domain', async (req, res) => {
    const { domainName, domainType, company, registerDate, renewalDate, status, hostingType } = req.body;

    // Log the incoming request to debug the issue
    console.log('Update request received:', req.body);

    try {
        const result = await pool.query(
            `UPDATE domains
            SET domain_type = $1, company = $2, register_date = $3, next_renewal_date = $4, status = $5, hosting_type = $6
            WHERE domain_name = $7`,
            [domainType, company, registerDate, renewalDate, status, hostingType, domainName]
        );

        if (result.rowCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Domain not found' });
        }
    } catch (error) {
        console.error('Error updating the domain:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Fetch domain statistics
const fetchDomainStatistics = async () => {
    try {
        const result = await pool.query('SELECT COUNT(*) AS count FROM domains');
        const totalDomains = parseInt(result.rows[0].count, 10) || 0;

        const activeResult = await pool.query('SELECT COUNT(*) AS active_count FROM domains WHERE LOWER(status) = \'active\'');
        const activeDomains = parseInt(activeResult.rows[0].active_count, 10) || 0;

        return { totalDomains, activeDomains };
    } catch (err) {
        console.error('Error fetching domain statistics:', err);
        return { totalDomains: 0, activeDomains: 0 };
    }
};

// Fetch domains for a specific interval
const fetchDomains = async (interval) => {
    const query = `
        SELECT domain_name, next_renewal_date, last_reminder_interval FROM domains
        WHERE next_renewal_date BETWEEN NOW() AND NOW() + INTERVAL '${interval}'
          AND LOWER(status) = 'active'
        ORDER BY next_renewal_date;
    `;
    try {
        const { rows } = await pool.query(query);
        console.log(`Fetched domains for interval '${interval}':`, rows);
        return rows;
    } catch (err) {
        console.error('Error fetching domains:', err.stack);
        return [];
    }
};

// Route for domain management
app.get('/domain-management', async (req, res) => {
    try {
        const domainsOneWeek = await fetchDomains('7 days');
        const domainsTwoWeeks = await fetchDomains('14 days');
        const domainsOneMonth = await fetchDomains('1 month');

        res.render('domain-management', {
            title: 'Domain Management',
            pageHeading: 'Manage Your Domains',
            domainsOneWeek,
            domainsTwoWeeks,
            domainsOneMonth
        });
    } catch (err) {
        console.error('Error fetching domain data:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

// Route to get domain data for editing
app.get('/get-domain', async (req, res) => {
    const { domainName } = req.query;
    try {
        const result = await pool.query('SELECT * FROM domains WHERE domain_name = $1', [domainName]);
        if (result.rows.length > 0) {
            res.json({ success: true, domain: result.rows[0] });
        } else {
            res.json({ success: false });
        }
    } catch (err) {
        console.error('Error fetching domain data:', err.stack);
        res.json({ success: false });
    }
});

// Route to render the edit domain page
app.get('/edit-domain', (req, res) => {
    res.render('edit-domain', {
        title: 'Edit Domain',
        pageHeading: 'Edit Domain'
    });
});

// Route to render the add domain page
app.get('/add-domain', (req, res) => {
    res.render('add-domain', {
        title: 'Add New Domain',
        pageHeading: 'Add New Domain'
    });
});

// Route to handle domain submission
app.post('/submit-domain', async (req, res) => {
    const { domainName, domainType, company, registerDate, renewalDate, status, hostingType } = req.body;

    try {
        const query = `
            INSERT INTO domains (domain_name, domain_type, company, register_date, next_renewal_date, status, hosting_type, last_reminder_interval)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
        `;
        const values = [domainName, domainType, company, registerDate, renewalDate, status, hostingType];

        await pool.query(query, values);
        console.log('Domain data inserted successfully');

        // Check and send reminder email for the newly added domain
        await checkAndSendReminderForDomain(domainName);
    } catch (err) {
        console.error('Error inserting domain data:', err.stack);
    }
    res.send(`
        <script>
            alert('Domain added successfully!');
            window.location.href = '/domain-management';
        </script>
    `);
});

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ravinduudana98@gmail.com',
        pass: 'joje xosj xuce dfnm'
    }
});

// Send reminder email
const sendReminderEmail = async (domain, daysLeft) => {
    const mailOptions = {
        from: 'ravinduudana98@gmail.com',
        to: 'ravindu@mclarens.lk',
        subject: 'Domain Expiration Reminder',
        text: `The domain '${domain}' is expiring in ${daysLeft} days. Please take necessary action.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Reminder email sent for domain '${domain}'`);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

// Check domain expiration and send reminder if necessary
const checkAndSendReminderForDomain = async (domain) => {
    try {
        const result = await pool.query('SELECT next_renewal_date, last_reminder_interval FROM domains WHERE domain_name = $1', [domain]);
        if (result.rows.length > 0) {
            const { next_renewal_date, last_reminder_interval } = result.rows[0];
            const currentDate = new Date();
            const renewalDate = new Date(next_renewal_date);
            const daysLeft = Math.ceil((renewalDate - currentDate) / (1000 * 60 * 60 * 24));

            if (daysLeft <= 30 && last_reminder_interval !== '1 month') {
                await sendReminderEmail(domain, daysLeft);
                await pool.query('UPDATE domains SET last_reminder_interval = $1 WHERE domain_name = $2', ['1 month', domain]);
            }

            if (daysLeft <= 14 && last_reminder_interval !== '2 weeks') {
                await sendReminderEmail(domain, daysLeft);
                await pool.query('UPDATE domains SET last_reminder_interval = $1 WHERE domain_name = $2', ['2 weeks', domain]);
            }

            if (daysLeft <= 7 && last_reminder_interval !== '1 week') {
                await sendReminderEmail(domain, daysLeft);
                await pool.query('UPDATE domains SET last_reminder_interval = $1 WHERE domain_name = $2', ['1 week', domain]);
            }
        }
    } catch (err) {
        console.error('Error checking domain expiration:', err.stack);
    }
};

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error during logout:', err);
        }
        res.redirect('/login');
    });
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
