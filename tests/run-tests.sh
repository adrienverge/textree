#!/bin/bash

textree=../bin/textree
echo "Running tests on Textree..."

for dir in $(find group.* -maxdepth 0 -type d); do
    group=$(echo $dir | sed 's/group\.//')
    echo "-- Test group: '$group' --"
    if [ ! -f $dir/pipeline ]; then
        echo "Missing file: $dir/pipeline"
        exit 2
    fi
    args=$(cat $dir/pipeline)

    for out_file in $dir/*.out; do
        test=$(basename $out_file .out)
        in_file=$dir/$test.in

        echo -n "Testing: $test .. "
        diff=$(cat $in_file | $textree $args | diff $out_file -)
        status=$?
        if [ $status -eq 0 ]; then
            echo "OK"
        else
            echo "Failed!"
            echo
            (
                echo "The output of command: cat $in_file | $textree $args"
                echo "differs from expected content from: $out_file"
                echo
                echo "$diff"
            ) | sed 's/^/    /'
            echo
        fi
    done
done
