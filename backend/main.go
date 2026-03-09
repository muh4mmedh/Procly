package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"github.com/lib/pq"
	_ "github.com/microsoft/go-mssqldb"
	"google.golang.org/api/option"
)

type DBConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Database string `json:"database"`
}

type TableInfo struct {
	Name string `json:"name"`
	Rows int    `json:"rows"`
	Type string `json:"type"`
}

type MigrationLog struct {
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
	Type      string `json:"type"` // "info", "success", "error"
}

type ColumnInfo struct {
	Name         string `json:"name"`
	DataType     string `json:"dataType"`
	MaxLength    int64  `json:"maxLength"`
	IsNullable   bool   `json:"isNullable"`
	DefaultValue string `json:"defaultValue"`
	PGType       string `json:"pgType"` // Suggested PG type
	IsPK         bool   `json:"isPK"`
}

type IndexInfo struct {
	Name      string `json:"name"`
	Columns   string `json:"columns"`
	IsUnique  bool   `json:"isUnique"`
	IsPrimary bool   `json:"isPrimary"`
}

type ForeignKeyInfo struct {
	ConstraintName string `json:"constraintName"`
	ColumnName     string `json:"columnName"`
	RefTable       string `json:"refTable"`
	RefColumn      string `json:"refColumn"`
}

type TableSchema struct {
	TableName   string           `json:"tableName"`
	Columns     []ColumnInfo     `json:"columns"`
	Indexes     []IndexInfo      `json:"indexes"`
	ForeignKeys []ForeignKeyInfo `json:"foreignKeys"`
}

type ConversionRequest struct {
	SourceCode string `json:"sourceCode"`
	Type       string `json:"type"` // "FUNCTION" or "PROCEDURE"
}

func main() {
	err := godotenv.Load("../.env")
	if err != nil {
		log.Println("Error loading .env file")
	}

	app := fiber.New()
	app.Use(cors.New())

	app.Post("/api/check-connection-mssql", checkMSSQL)
	app.Post("/api/check-connection-postgres", checkPostgres)
	app.Post("/api/list-databases-mssql", listMSSQLDatabases)
	app.Post("/api/list-databases-postgres", listPostgresDatabases)
	app.Post("/api/mssql/routines", getMSSQLRoutines)
	app.Post("/api/mssql/tables", getMSSQLTables)
	app.Post("/api/mssql/table-schema", getMSSQLTableSchema)
	app.Post("/api/postgres/tables", getPostgresTables)
	app.Post("/api/migrate/schema", createSchemaSingle)
	app.Post("/api/migrate/data", migrateDataSingle)
	app.Post("/api/convert", convertRoutine)
	app.Post("/api/execute-postgres", executePostgres)
	app.Post("/api/check-routine-exists", checkRoutineExists)
	app.Post("/api/check-routines-exists", checkRoutinesExists)
	app.Post("/api/postgres/routine-source", getPostgresRoutineSource)

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}

	log.Fatal(app.Listen(":" + port))
}

func checkMSSQL(c *fiber.Ctx) error {
	var cfg DBConfig
	if err := c.BodyParser(&cfg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("server=%s;user id=%s;password=%s;port=%d;database=%s;",
		cfg.Host, cfg.User, cfg.Password, cfg.Port, cfg.Database)

	db, err := sql.Open("sqlserver", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "MSSQL Connection successful"})
}

func checkPostgres(c *fiber.Ctx) error {
	var cfg DBConfig
	if err := c.BodyParser(&cfg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Postgres Connection successful"})
}

func listMSSQLDatabases(c *fiber.Ctx) error {
	var cfg DBConfig
	if err := c.BodyParser(&cfg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("server=%s;user id=%s;password=%s;port=%d;",
		cfg.Host, cfg.User, cfg.Password, cfg.Port)

	db, err := sql.Open("sqlserver", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	rows, err := db.Query("SELECT name FROM sys.databases WHERE database_id > 4")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	dbs := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			dbs = append(dbs, name)
		}
	}
	return c.JSON(dbs)
}

func listPostgresDatabases(c *fiber.Ctx) error {
	var cfg DBConfig
	if err := c.BodyParser(&cfg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=postgres sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	rows, err := db.Query("SELECT datname FROM pg_database WHERE datistemplate = false")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	dbs := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			dbs = append(dbs, name)
		}
	}
	return c.JSON(dbs)
}

func getMSSQLRoutines(c *fiber.Ctx) error {
	// In a real scenario, we'd use the connection info from headers or a session
	// For this tool, we'll allow passing connection info in the body for the metadata fetch
	var cfg DBConfig
	if err := c.BodyParser(&cfg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("server=%s;user id=%s;password=%s;port=%d;database=%s;",
		cfg.Host, cfg.User, cfg.Password, cfg.Port, cfg.Database)

	db, err := sql.Open("sqlserver", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	query := `
		SELECT 
			SPECIFIC_NAME as Name, 
			ROUTINE_TYPE as Type, 
			ROUTINE_DEFINITION as Code
		FROM INFORMATION_SCHEMA.ROUTINES
		WHERE ROUTINE_SCHEMA = 'dbo'
	`
	rows, err := db.Query(query)
	if err != nil {
		// Mock data if query fails or table doesn't exist (for demo purposes)
		return c.JSON([]fiber.Map{
			{"id": 1, "name": "usp_GetEmployeeDetails", "type": "PROCEDURE", "code": "CREATE PROCEDURE usp_GetEmployeeDetails @EmpID INT AS SELECT * FROM Employees WHERE ID = @EmpID"},
			{"id": 2, "name": "fn_CalculateTax", "type": "FUNCTION", "code": "CREATE FUNCTION fn_CalculateTax (@Amount DECIMAL(18,2)) RETURNS DECIMAL(18,2) AS BEGIN RETURN @Amount * 0.15 END"},
		})
	}
	defer rows.Close()

	var results []fiber.Map
	i := 1
	for rows.Next() {
		var name, rType, code string
		if err := rows.Scan(&name, &rType, &code); err == nil {
			results = append(results, fiber.Map{
				"id":   i,
				"name": name,
				"type": rType,
				"code": code,
			})
			i++
		}
	}

	return c.JSON(results)
}

func convertRoutine(c *fiber.Ctx) error {
	var req ConversionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	ctx := context.Background()
	// Prefer API key from request header (X-Gemini-Key). Fall back to environment variable.
	apiKey := c.Get("X-Gemini-Key")
	if apiKey == "" {
		apiKey = os.Getenv("GEMINI_API_KEY")
	}
	if apiKey == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing Gemini API key. Please provide it via the X-Gemini-Key header or set GEMINI_API_KEY in environment."})
	}
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "AI Client error: " + err.Error()})
	}
	defer client.Close()

	model := client.GenerativeModel(os.Getenv("GEMINI_MODEL"))

	prompt := fmt.Sprintf("%s\n\nConvert this MSSQL %s to PostgreSQL:\n\n%s",
		os.Getenv("CONVERSION_SYSTEM_PROMPT"), req.Type, req.SourceCode)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "AI Generation error: " + err.Error()})
	}

	if len(resp.Candidates) == 0 {
		return c.Status(500).JSON(fiber.Map{"error": "No response from AI"})
	}

	// Extract text from response
	var convertedText string
	for _, part := range resp.Candidates[0].Content.Parts {
		if t, ok := part.(genai.Text); ok {
			convertedText += string(t)
		}
	}

	return c.JSON(fiber.Map{"convertedCode": convertedText})
}

func getMSSQLTables(c *fiber.Ctx) error {
	var cfg DBConfig
	if err := c.BodyParser(&cfg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("server=%s;user id=%s;password=%s;port=%d;database=%s;",
		cfg.Host, cfg.User, cfg.Password, cfg.Port, cfg.Database)

	db, err := sql.Open("sqlserver", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT SCHEMA_NAME(schema_id) + '.' + name as name, 0 as rows, 'VIEW' as type FROM sys.views
		UNION ALL
		SELECT SCHEMA_NAME(t.schema_id) + '.' + t.name as name, SUM(p.rows) as rows, 'TABLE' as type
		FROM sys.tables t
		INNER JOIN sys.partitions p ON t.object_id = p.object_id
		WHERE t.is_ms_shipped = 0 AND p.index_id IN (0,1)
		GROUP BY t.schema_id, t.name
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var tables []TableInfo
	for rows.Next() {
		var info TableInfo
		if err := rows.Scan(&info.Name, &info.Rows, &info.Type); err == nil {
			tables = append(tables, info)
		}
	}
	return c.JSON(tables)
}

func getMSSQLTableSchema(c *fiber.Ctx) error {
	type SchemaRequest struct {
		Config DBConfig `json:"config"`
		Table  string   `json:"table"`
	}
	var req SchemaRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("server=%s;user id=%s;password=%s;port=%d;database=%s;",
		req.Config.Host, req.Config.User, req.Config.Password, req.Config.Port, req.Config.Database)
	db, err := sql.Open("sqlserver", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	// 1. Fetch Columns and PK info
	rows, err := db.Query(fmt.Sprintf(`
		SELECT 
			c.name AS COLUMN_NAME,
			t.name AS DATA_TYPE,
			c.max_length AS CHARACTER_MAXIMUM_LENGTH,
			c.is_nullable,
			ISNULL(object_definition(c.default_object_id), '') AS COLUMN_DEFAULT,
			CASE WHEN EXISTS (
				SELECT 1 FROM sys.index_columns ic 
				INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
				WHERE ic.object_id = c.object_id AND ic.column_id = c.column_id AND i.is_primary_key = 1
			) THEN 1 ELSE 0 END AS IS_PK
		FROM sys.columns c
		JOIN sys.types t ON c.user_type_id = t.user_type_id
		WHERE c.object_id = OBJECT_ID('%s')
		ORDER BY c.column_id
	`, req.Table))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var columns []ColumnInfo
	for rows.Next() {
		var name, dType string
		var isPkInt int
		var maxLen int16
		var colDefault string
		var isNullBool bool

		err := rows.Scan(&name, &dType, &maxLen, &isNullBool, &colDefault, &isPkInt)
		if err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}

		columns = append(columns, ColumnInfo{
			Name:         name,
			DataType:     dType,
			MaxLength:    int64(maxLen),
			IsNullable:   isNullBool,
			DefaultValue: colDefault,
			PGType:       mapMSSQLToPG(dType, sql.NullInt64{Int64: int64(maxLen), Valid: true}),
			IsPK:         isPkInt == 1,
		})
	}

	// 2. Fetch Indexes
	var indexes []IndexInfo
	idxRows, err := db.Query(fmt.Sprintf(`
		SELECT 
			i.name AS IndexName,
			STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS ColumnNames,
			i.is_unique,
			i.is_primary_key
		FROM sys.indexes i
		INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		WHERE i.object_id = OBJECT_ID('%s')
		GROUP BY i.name, i.is_unique, i.is_primary_key
	`, req.Table))
	if err == nil {
		defer idxRows.Close()
		for idxRows.Next() {
			var idx IndexInfo
			idxRows.Scan(&idx.Name, &idx.Columns, &idx.IsUnique, &idx.IsPrimary)
			indexes = append(indexes, idx)
		}
	}

	// 3. Fetch Foreign Keys
	var fks []ForeignKeyInfo
	fkRows, err := db.Query(fmt.Sprintf(`
		SELECT 
			obj.name AS ConstraintName,
			col.name AS ColumnName,
			referenced_table.name AS ReferencedTable,
			referenced_col.name AS ReferencedColumn
		FROM sys.foreign_key_columns fkc
		INNER JOIN sys.objects obj ON fkc.constraint_object_id = obj.object_id
		INNER JOIN sys.tables parent_table ON fkc.parent_object_id = parent_table.object_id
		INNER JOIN sys.columns col ON fkc.parent_object_id = col.object_id AND fkc.parent_column_id = col.column_id
		INNER JOIN sys.tables referenced_table ON fkc.referenced_object_id = referenced_table.object_id
		INNER JOIN sys.columns referenced_col ON fkc.referenced_object_id = referenced_col.object_id AND fkc.referenced_column_id = referenced_col.column_id
		WHERE parent_table.object_id = OBJECT_ID('%s')
	`, req.Table))
	if err == nil {
		defer fkRows.Close()
		for fkRows.Next() {
			var fk ForeignKeyInfo
			fkRows.Scan(&fk.ConstraintName, &fk.ColumnName, &fk.RefTable, &fk.RefColumn)
			fks = append(fks, fk)
		}
	}

	return c.JSON(TableSchema{
		TableName:   req.Table,
		Columns:     columns,
		Indexes:     indexes,
		ForeignKeys: fks,
	})
}

func getPostgresTables(c *fiber.Ctx) error {
	var cfg DBConfig
	if err := c.BodyParser(&cfg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	rows, err := db.Query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}
	return c.JSON(tables)
}

func createSchemaSingle(c *fiber.Ctx) error {
	type SchemaRequest struct {
		Source DBConfig    `json:"source"`
		Target DBConfig    `json:"target"`
		Table  string      `json:"table"`
		Schema TableSchema `json:"schema"` // Optional custom schema
	}
	var req SchemaRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	tgtConnStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		req.Target.Host, req.Target.Port, req.Target.User, req.Target.Password, req.Target.Database)
	tgtDb, err := sql.Open("postgres", tgtConnStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Target connection error: " + err.Error()})
	}
	defer tgtDb.Close()

	var columns []ColumnInfo
	if len(req.Schema.Columns) > 0 {
		columns = req.Schema.Columns
	} else {
		srcConnStr := fmt.Sprintf("server=%s;user id=%s;password=%s;port=%d;database=%s;",
			req.Source.Host, req.Source.User, req.Source.Password, req.Source.Port, req.Source.Database)
		srcDb, err := sql.Open("sqlserver", srcConnStr)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Source connection error: " + err.Error()})
		}
		defer srcDb.Close()

		rows, err := srcDb.Query(fmt.Sprintf(`
			SELECT 
				c.name AS COLUMN_NAME,
				t.name AS DATA_TYPE,
				c.max_length AS CHARACTER_MAXIMUM_LENGTH,
				c.is_nullable,
				ISNULL(object_definition(c.default_object_id), '') AS COLUMN_DEFAULT,
				CASE WHEN EXISTS (
					SELECT 1 FROM sys.index_columns ic 
					INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
					WHERE ic.object_id = c.object_id AND ic.column_id = c.column_id AND i.is_primary_key = 1
				) THEN 1 ELSE 0 END AS IS_PK
			FROM sys.columns c
			JOIN sys.types t ON c.user_type_id = t.user_type_id
			WHERE c.object_id = OBJECT_ID('%s')
			ORDER BY c.column_id
		`, req.Table))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to get metadata: " + err.Error()})
		}
		defer rows.Close()

		for rows.Next() {
			var name, dType string
			var isPkInt int
			var maxLen int16
			var colDefault string
			var isNullBool bool

			err := rows.Scan(&name, &dType, &maxLen, &isNullBool, &colDefault, &isPkInt)
			if err != nil {
				continue
			}

			columns = append(columns, ColumnInfo{
				Name:         name,
				PGType:       mapMSSQLToPG(dType, sql.NullInt64{Int64: int64(maxLen), Valid: true}),
				IsNullable:   isNullBool,
				DefaultValue: colDefault,
				IsPK:         isPkInt == 1,
			})
		}
	}

	// Sanitize table name for PG (strip schema, lowercase, quote)
	baseTable := req.Table
	if idx := strings.LastIndex(req.Table, "."); idx != -1 {
		baseTable = req.Table[idx+1:]
	}
	pgTable := `"` + strings.ToLower(baseTable) + `"`

	var createSQL string
	createSQL = fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (", pgTable)
	colList := []string{}
	pkCols := []string{}

	for _, col := range columns {
		nullStr := ""
		if !col.IsNullable {
			nullStr = "NOT NULL"
		}

		safeColName := `"` + strings.ToLower(col.Name) + `"`
		if col.IsPK {
			pkCols = append(pkCols, safeColName)
		}

		defStr := ""
		if col.DefaultValue != "" {
			d := strings.TrimSpace(col.DefaultValue)
			// Remove MSSQL parentheses wrapping: ((0)) -> 0
			for strings.HasPrefix(d, "(") && strings.HasSuffix(d, ")") {
				d = d[1 : len(d)-1]
			}

			lowD := strings.ToLower(d)
			if strings.Contains(lowD, "getdate") {
				defStr = "DEFAULT CURRENT_TIMESTAMP"
			} else if strings.Contains(lowD, "newid") || strings.Contains(lowD, "newsequentialid") {
				defStr = "DEFAULT gen_random_uuid()"
			} else if col.PGType == "boolean" {
				cleanBit := strings.Trim(d, "'\" ")
				if cleanBit == "0" {
					defStr = "DEFAULT FALSE"
				} else if cleanBit == "1" {
					defStr = "DEFAULT TRUE"
				} else if strings.EqualFold(cleanBit, "false") || strings.EqualFold(cleanBit, "true") {
					defStr = "DEFAULT " + strings.ToUpper(cleanBit)
				}
			} else if strings.Contains(d, "/") && (col.PGType == "timestamp" || col.PGType == "date") {
				// Handle (1)/(1)/(1900) garbage
				cleanDate := strings.ReplaceAll(d, "(", "")
				cleanDate = strings.ReplaceAll(cleanDate, ")", "")
				parts := strings.Split(cleanDate, "/")
				if len(parts) == 3 {
					// Likely M/D/Y. We'll simplify to a safe ISO-ish string
					defStr = "DEFAULT '1900-01-01'"
				}
			} else if strings.HasPrefix(lowD, "n'") {
				defStr = fmt.Sprintf("DEFAULT %s", d[1:])
			} else if d != "" {
				// Final safety check: if it contains slashes or weird chars and isn't quoted, it might break
				if strings.Contains(d, "/") || strings.Contains(d, "-") {
					if !strings.HasPrefix(d, "'") {
						defStr = fmt.Sprintf("DEFAULT '%s'", d)
					} else {
						defStr = fmt.Sprintf("DEFAULT %s", d)
					}
				} else {
					defStr = fmt.Sprintf("DEFAULT %s", d)
				}
			}
		}

		colList = append(colList, fmt.Sprintf("%s %s %s %s", safeColName, col.PGType, nullStr, defStr))
	}

	if len(pkCols) > 0 {
		colList = append(colList, fmt.Sprintf("PRIMARY KEY (%s)", strings.Join(pkCols, ", ")))
	}

	createSQL += strings.Join(colList, ", ") + ");"

	_, err = tgtDb.Exec(createSQL)
	if err != nil {
		log.Printf("Failed to create table in Postgres: %s\nError: %v\nSQL: %s", pgTable, err, createSQL)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create table: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Schema created/verified successfully"})
}

func migrateDataSingle(c *fiber.Ctx) error {
	type DataRequest struct {
		Source DBConfig `json:"source"`
		Target DBConfig `json:"target"`
		Table  string   `json:"table"`
	}
	var req DataRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	srcConnStr := fmt.Sprintf("server=%s;user id=%s;password=%s;port=%d;database=%s;",
		req.Source.Host, req.Source.User, req.Source.Password, req.Source.Port, req.Source.Database)
	srcDb, err := sql.Open("sqlserver", srcConnStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Source connection error: " + err.Error()})
	}
	defer srcDb.Close()

	tgtConnStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		req.Target.Host, req.Target.Port, req.Target.User, req.Target.Password, req.Target.Database)
	tgtDb, err := sql.Open("postgres", tgtConnStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Target connection error: " + err.Error()})
	}
	defer tgtDb.Close()

	// Sanitize names for PG
	baseTable := req.Table
	if idx := strings.LastIndex(req.Table, "."); idx != -1 {
		baseTable = req.Table[idx+1:]
	}
	pgTable := `"` + strings.ToLower(baseTable) + `"`

	// Select with brackets for MSSQL if there are spaces/reserved words
	srcTable := req.Table
	if !strings.Contains(srcTable, "[") {
		parts := strings.Split(srcTable, ".")
		for i, p := range parts {
			parts[i] = "[" + p + "]"
		}
		srcTable = strings.Join(parts, ".")
	}

	rows, err := srcDb.Query(fmt.Sprintf("SELECT * FROM %s", srcTable))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch data: " + err.Error()})
	}
	defer rows.Close()

	columnNames, _ := rows.Columns()
	quotedColumnNames := make([]string, len(columnNames))
	for i, name := range columnNames {
		quotedColumnNames[i] = `"` + strings.ToLower(name) + `"`
	}

	placeholders := []string{}
	for i := 1; i <= len(columnNames); i++ {
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
	}

	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		pgTable, strings.Join(quotedColumnNames, ", "), strings.Join(placeholders, ", "))

	count := 0
	for rows.Next() {
		values := make([]interface{}, len(columnNames))
		valuePtrs := make([]interface{}, len(columnNames))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}
		cleanedValues := make([]interface{}, len(values))
		for i, val := range values {
			cleanedValues[i] = cleanValue(val)
		}
		_, err = tgtDb.Exec(insertSQL, cleanedValues...)
		if err == nil {
			count++
		}
	}

	return c.JSON(fiber.Map{
		"message":   "Data migration completed",
		"rows":      count,
		"tableName": req.Table,
	})
}

func mapMSSQLToPG(mssqlType string, maxLen sql.NullInt64) string {
	switch mssqlType {
	case "int":
		return "integer"
	case "bigint":
		return "bigint"
	case "smallint":
		return "smallint"
	case "varchar", "nvarchar":
		if maxLen.Valid && maxLen.Int64 != -1 {
			return fmt.Sprintf("varchar(%d)", maxLen.Int64)
		}
		return "text"
	case "char", "nchar":
		if maxLen.Valid && maxLen.Int64 != -1 {
			return fmt.Sprintf("char(%d)", maxLen.Int64)
		}
		return "char(255)"
	case "text", "ntext":
		return "text"
	case "decimal", "numeric":
		return "numeric"
	case "bit":
		return "boolean"
	case "datetime", "datetime2":
		return "timestamp"
	case "date":
		return "date"
	default:
		return "text"
	}
}

func cleanValue(v interface{}) interface{} {
	if b, ok := v.([]byte); ok {
		// Replace null bytes in byte slices
		return strings.ReplaceAll(string(b), "\x00", "")
	}
	if s, ok := v.(string); ok {
		return strings.ReplaceAll(s, "\x00", "")
	}
	return v
}

func executePostgres(c *fiber.Ctx) error {
	type ExecuteRequest struct {
		Config DBConfig `json:"config"`
		SQL    string   `json:"sql"`
	}
	var req ExecuteRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		req.Config.Host, req.Config.Port, req.Config.User, req.Config.Password, req.Config.Database)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	// Clean SQL: remove Markdown fences that may be present in AI output (e.g. ```sql ... ```)
	cleanSQL := strings.TrimSpace(req.SQL)
	// Remove fenced code blocks like ```sql or ```
	cleanSQL = strings.ReplaceAll(cleanSQL, "```sql", "")
	cleanSQL = strings.ReplaceAll(cleanSQL, "```", "")
	cleanSQL = strings.TrimSpace(cleanSQL)

	_, err = db.Exec(cleanSQL)
	if err != nil {
		// Try to extract rich details from pq.Error when possible
		if pqErr, ok := err.(*pq.Error); ok {
			info := fiber.Map{
				"error": "Execution error: " + pqErr.Message,
				"pq": fiber.Map{
					"code":     string(pqErr.Code),
					"message":  pqErr.Message,
					"detail":   pqErr.Detail,
					"hint":     pqErr.Hint,
					"position": pqErr.Position,
				},
			}
			return c.Status(500).JSON(info)
		}
		return c.Status(500).JSON(fiber.Map{"error": "Execution error: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "SQL executed successfully on Postgres"})
}

func checkRoutineExists(c *fiber.Ctx) error {
	type CheckRequest struct {
		Config DBConfig `json:"config"`
		Name   string   `json:"name"`
	}
	var req CheckRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		req.Config.Host, req.Config.Port, req.Config.User, req.Config.Password, req.Config.Database)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	// Check by proname in pg_proc. This checks for any function/procedure with that name.
	var exists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proname = $1)", req.Name).Scan(&exists)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"exists": exists})
}

func checkRoutinesExists(c *fiber.Ctx) error {
	type Req struct {
		Config DBConfig `json:"config"`
		Names  []string `json:"names"`
	}
	var req Req
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	if len(req.Names) == 0 {
		return c.JSON(fiber.Map{"results": map[string]bool{}})
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		req.Config.Host, req.Config.Port, req.Config.User, req.Config.Password, req.Config.Database)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	// Build lowercased names array
	lowerNames := make([]string, 0, len(req.Names))
	for _, n := range req.Names {
		lowerNames = append(lowerNames, strings.ToLower(n))
	}

	// Query for any matching proname (lowercase) in pg_proc
	rows, err := db.Query("SELECT lower(proname) FROM pg_catalog.pg_proc WHERE lower(proname) = ANY($1)", pq.Array(lowerNames))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	found := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			found[name] = true
		}
	}

	results := map[string]bool{}
	for _, n := range lowerNames {
		results[n] = found[n]
	}

	return c.JSON(fiber.Map{"results": results})
}

// getPostgresRoutineSource returns the CREATE FUNCTION/PROCEDURE definition for a given routine name (case-insensitive).
func getPostgresRoutineSource(c *fiber.Ctx) error {
	type Req struct {
		Config DBConfig `json:"config"`
		Name   string   `json:"name"`
	}
	var req Req
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	if req.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing routine name"})
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		req.Config.Host, req.Config.Port, req.Config.User, req.Config.Password, req.Config.Database)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	// Find a matching proc oid (case-insensitive). Prefer first match.
	var oid int
	err = db.QueryRow("SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid WHERE lower(p.proname) = lower($1) LIMIT 1", req.Name).Scan(&oid)
	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Routine not found on target"})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	var def sql.NullString
	err = db.QueryRow("SELECT pg_get_functiondef($1)", oid).Scan(&def)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if !def.Valid {
		return c.Status(500).JSON(fiber.Map{"error": "Could not retrieve function definition"})
	}

	return c.JSON(fiber.Map{"definition": def.String})
}
