<?php
/**
 * File: export.php
 * Purpose: Export inactive or unpaid users to a CSV file.
 * Requirements: PHP with MySQLi and a valid database connection.
 */
declare(strict_types=1);
require_once __DIR__ . '/db_connect.php';
// Prevent PHP warnings from corrupting the CSV download.
ini_set('display_errors', '0');
error_reporting(E_ALL);
// Validate database connection.
if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    exit('Database connection is unavailable.');
}
// Retrieve inactive or unpaid users.
$sql = "
    SELECT username, email
    FROM users
    WHERE status = 'inactive'
       OR is_paid = 0
       OR paid = 0
    ORDER BY username ASC
";
$result = $conn->query($sql);
if ($result === false) {
    error_log('User CSV export failed: ' . $conn->error);
    http_response_code(500);
    exit('Unable to export users at this time.');
}
// Set download headers.
$filename = 'inactive_users_' . date('Y-m-d_H-i-s') . '.csv';
header('Content-Type: text/csv; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
// Open the output stream.
$output = fopen('php://output', 'w');
if ($output === false) {
    $result->free();
    http_response_code(500);
    exit('Unable to generate the CSV file.');
}
// Add UTF-8 BOM for compatibility with Microsoft Excel.
fwrite($output, "\xEF\xBB\xBF");
// Add column headings.
fputcsv($output, ['Username', 'Email Address']);
// Export matching records.
while ($row = $result->fetch_assoc()) {
    // Reduce the risk of spreadsheet formula injection.
    $username = (string) ($row['username'] ?? '');
    $email = (string) ($row['email'] ?? '');
    foreach (['username', 'email'] as $field) {
        $value = $$field;
        if (preg_match('/^[\s]*[=+\-@]/u', $value)) {
            $$field = "'" . $value;
        }
    }
    fputcsv($output, [$username, $email]);
}
// Clean up resources.
fclose($output);
$result->free();
exit;
?>
