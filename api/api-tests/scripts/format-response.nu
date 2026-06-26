
#!/usr/bin/env nu

def main [file: string, verbose_file: string] {
    let raw = open $file | into string
    let verbose = open $verbose_file | into string
    let verbose_lines = $verbose | lines

    # Group consecutive ">" lines into separate request blocks
    let req_blocks = (
        $verbose_lines
        | reduce -f {blocks: [], current: []} { |line, acc|
            if ($line | str starts-with "> ") {
                {blocks: $acc.blocks, current: ($acc.current | append $line)}
            } else if ($acc.current | is-not-empty) {
                {blocks: ($acc.blocks | append [$acc.current]), current: []}
            } else {
                $acc
            }
        }
        | get blocks
    )

    let requests = $req_blocks | each { |block|
        let req_line = $block | first | str replace "> " ""
        let headers = $block | skip 1 | where { |l| $l | str contains ": " } | each { |line|
            let kv = ($line | str replace "> " "") | split row ": "
            { header: ($kv | first), value: ($kv | skip 1 | str join ": ") }
        }
        { line: $req_line, headers: $headers }
    }

    let total = $requests | length
    let parsed_stdout = parse_stdout_response $raw
    let parsed_verbose = parse_verbose_response $verbose_lines
    let response = if ($parsed_stdout.status_line | is-not-empty) {
        {
            status_line: $parsed_stdout.status_line,
            headers: $parsed_stdout.headers,
            body: $parsed_stdout.body,
            timing: $parsed_verbose.timing,
        }
    } else {
        $parsed_verbose
    }

    for req in ($requests | enumerate) {
        let n = $req.index + 1
        print $"\n(ansi cyan)Request ($n)/($total)(ansi reset)  ($req.item.line)"
        print ($req.item.headers | table)
    }

    if ($response.status_line | is-not-empty) {
        let status_code = $response.status_line | split row " " | get 1 | into int
        let status_color = if $status_code < 300 { ansi green } else if $status_code < 400 { ansi yellow } else { ansi red }

        print $"\n(ansi cyan)Response ($total)/($total)(ansi reset) ($status_color)($response.status_line)(ansi reset)"
        print ($response.headers | table)

        if ($response.timing | is-not-empty) {
            print $"\n(ansi cyan)Timing(ansi reset)"
            print (parse_timing_table $response.timing | table)
        }
    }

    if ($response.body | is-not-empty) {
        print $"\n(ansi cyan)Body(ansi reset)"
        $response.body | ^jq -C '.'
    }
}

def parse_stdout_response [raw: string] {
    let trimmed = $raw | str trim
    if ($trimmed | is-empty) {
        return {
            status_line: "",
            headers: [],
            body: "",
            timing: "",
        }
    }

    let sections = $raw | split row "\n\n"
    let header_section = $sections | first
    let body = $sections | skip 1 | str join "\n\n" | str trim
    let status_line = $header_section | lines | first
    let headers = $header_section | lines | skip 1 | where { |l| $l | str trim | is-not-empty } | each { |line|
        let kv = $line | split row ": "
        { header: ($kv | first), value: ($kv | skip 1 | str join ": ") }
    }

    {
        status_line: $status_line,
        headers: $headers,
        body: $body,
        timing: "",
    }
}

def parse_verbose_response [verbose_lines: list<string>] {
    let timing_lines = (
        $verbose_lines
        | reduce -f {capturing: false, lines: []} { |line, acc|
            if ($line | str starts-with "* Timings:") {
                {capturing: true, lines: [$line]}
            } else if $acc.capturing and ($line | str starts-with "* ") {
                {capturing: true, lines: ($acc.lines | append $line)}
            } else if $acc.capturing {
                {capturing: false, lines: $acc.lines}
            } else {
                $acc
            }
        }
        | get lines
    )

    let response_lines = (
        $verbose_lines
        | reduce -f {capturing: false, lines: []} { |line, acc|
            if ($line | str starts-with "< HTTP/") {
                {capturing: true, lines: [$line]}
            } else if $acc.capturing and ($line | str starts-with "< ") {
                {capturing: true, lines: ($acc.lines | append $line)}
            } else if $acc.capturing {
                {capturing: false, lines: $acc.lines}
            } else {
                $acc
            }
        }
        | get lines
    )

    let status_line = (
        $response_lines
        | first
        | default ""
        | str replace "< " ""
    )

    let headers = $response_lines | skip 1 | each { |line|
        let kv = ($line | str replace "< " "") | split row ": "
        { header: ($kv | first), value: ($kv | skip 1 | str join ": ") }
    }

    {
        status_line: $status_line,
        headers: $headers,
        body: "",
        timing: ($timing_lines | str join "\n"),
    }
}

def parse_timing_table [timing: string] {
    $timing
    | lines
    | where { |line| ($line | str starts-with "* ") and (($line | str contains ":")) }
    | each { |line|
        let cleaned = $line | str replace --regex '^\*\s+' ''
        let parts = $cleaned | split row ": "
        {
            metric: ($parts | first),
            value: ($parts | skip 1 | str join ": "),
        }
    }
}
