const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

// Initialize express
const app = express();
const port = 3000;
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // MySQL username
  password: '@North35', // MySQL password
  database: 'testdb', // Database name
});

db.connect(err => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to the database.');
});

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage options
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Folder where the file will be saved
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max file size
}).single('file'); // Expecting a file input with name="file"

// File upload endpoint
app.post('/upload', (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Multer error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ message: `Internal server error: ${err.message}` });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = path.join(__dirname, 'uploads', req.file.filename);


    // Read and process the uploaded CSV file
    const headers = [];
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headerList) => {
        headers.push(...headerList); // Save the CSV headers
      })
      .on('data', (row) => {
        rows.push(row); // Save rows from the CSV
      })
      .on('end', () => {
        console.log('CSV file processed successfully.');

        // Create table if it doesn't exist
        const tableName = 'userTable';
        //const tableName = 'joinTable';
        //const tableName = 'tableTable';
        createTableIfNotExists(tableName, headers)
          .then(() => {
            // Insert data into the table after ensuring it exists
            insertDataIntoTable(tableName, headers, rows);
            // Delete the uploaded file after processing
            fs.unlinkSync(filePath);
            res.json({ message: 'File uploaded and processed successfully.' });
          })
          .catch((err) => {
            console.error('Error creating table or inserting data:', err);
            res.status(500).json({ message: 'Error processing CSV file.' });
          });
      })
      .on('error', (err) => {
        console.error('Error processing CSV:', err);
        res.status(500).json({ message: 'Error processing CSV file.' });
      });
  });
});


app.post('/table', (req, res) => {
  const { query } = req.body;
  
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      console.log(results);
      res.json(results);
    }
  });
});


// Function to create the table if it doesn't exist
function createTableIfNotExists(tableName, headers) {
  return new Promise((resolve, reject) => {
    // Create the columns from the headers (we'll assume the first row of CSV defines column names)
    const columns = headers.map((header) => `${header} VARCHAR(255)`).join(', ');


    // DROP SQL query for table creation
    const dropTableQuery = `DROP TABLE ${tableName}`;

    db.query(dropTableQuery, (err, results) => {
      if (err) {
        reject(err);
      } else {
        console.log('Table Dropped successfully.');
        resolve();
      }
    });

    // Create SQL query for table creation
    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ${columns}
    )`;

    db.query(createTableQuery, (err, results) => {
      if (err) {
        reject(err);
      } else {
        console.log('Table checked/created successfully.');
        resolve();
      }
    });
  });
}

// Function to insert data into the table
function insertDataIntoTable(tableName, headers, rows) {
  rows.forEach((row) => {
    const values = headers.map(header => row[header] || null); // Prepare the values to insert
    const placeholders = values.map(() => '?').join(', '); // Placeholder for SQL query

    // Create SQL insert query
    const insertQuery = `INSERT INTO ${tableName} (${headers.join(', ')}) VALUES (${placeholders})`;

    db.query(insertQuery, values, (err, results) => {
      if (err) {
        console.error('Error inserting data:', err);
      } else {
        console.log('Inserted data:', results);
      }
    });
  });
}
// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});